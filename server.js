const http = require('http');
const url = require('url');
const fs = require('fs');

// Chargez les clés API Airwallex depuis les variables d’environnement ou utilisez
// directement les valeurs fournies par l’utilisateur. Ces informations sont
// sensibles et ne devraient pas être exposées côté client. Gardez‑les
// uniquement côté serveur.
const AIRWALLEX_CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID || 'Aht4BFfJSFSxUbxNvLg-_g';
const AIRWALLEX_API_KEY = process.env.AIRWALLEX_API_KEY || 'b47e8ffe5af1b0270844899e81c1c786db1a6093c210290710594b5ccbc84850febc1d367c9c66cdd88782de335ff7eb';

let tokenCache = {
  token: null,
  expiresAt: 0,
};

/**
 * Obtenir un token d’authentification Airwallex. Le token est mis en cache
 * pendant sa durée de validité (30 minutes) afin d’éviter des appels
 * répétés à l’API d’authentification. Si le token est expiré ou absent,
 * une requête est envoyée à l’endpoint `/api/v1/authentication/login` comme
 * indiqué dans la documentation Airwallex【90265650198259†L80-L90】.
 */
async function getAccessToken() {
  const now = Date.now();
  // Renouveler le token 5 minutes avant son expiration pour plus de sécurité
  if (tokenCache.token && tokenCache.expiresAt - now > 5 * 60 * 1000) {
    return tokenCache.token;
  }
  // Exécute une requête HTTP POST avec les en‑têtes x-client-id et x-api-key
  const res = await fetch('https://api.airwallex.com/api/v1/authentication/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': AIRWALLEX_CLIENT_ID,
      'x-api-key': AIRWALLEX_API_KEY,
    },
  });
  const data = await res.json();
  tokenCache.token = data.token;
  // expires_at est renvoyé au format ISO8601【90265650198259†L80-L90】; convertissez‑le en timestamp
  tokenCache.expiresAt = Date.parse(data.expires_at);
  return tokenCache.token;
}

/**
 * Créer une intention de paiement (Payment Intent) via l’API Airwallex.
 * Le backend envoie le montant en centimes et la devise, et reçoit un
 * identifiant et un secret client. Ces valeurs sont utilisées côté
 * client pour monter le composant DropIn【90265650198259†L208-L210】.
 * @param {number} amount - Montant en centimes (ex. 89900 pour 899 €)
 * @returns {Promise<Object>} - Objet contenant l’ID et le client_secret
 */
async function createPaymentIntent(amount) {
  const token = await getAccessToken();
  const res = await fetch('https://api.airwallex.com/api/v1/pa/payment_intents/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: amount,
      currency: 'EUR',
      merchant_order_id: `order-${Date.now()}`,
      capture_method: 'AUTOMATIC',
    }),
  });
  const data = await res.json();
  return data;
}

/**
 * Serveur HTTP basique pour gérer les pages statiques et l’endpoint
 * `/create-payment-intent`. Les pages statiques sont lues depuis
 * `public/` tandis que l’endpoint JSON sert à créer des intentions
 * de paiement. La route ne doit pas être accessible via GET pour
 * préserver une séparation claire entre données et interface.
 */
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  // Endpoint pour créer une Payment Intent
  if (req.method === 'POST' && parsed.pathname === '/create-payment-intent') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const amount = parseInt(payload.amount, 10) || 0;
        const result = await createPaymentIntent(amount);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({ id: result.id, client_secret: result.client_secret })
        );
      } catch (error) {
        console.error(error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Erreur lors de la création de l’intention de paiement.' }));
      }
    });
    return;
  }

  // Gestion des fichiers statiques
  if (req.method === 'GET') {
    // Simplifiez les URL en redirigeant / vers index.html
    let filePath = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
    // Prévenir l’accès au système de fichiers en interdisant les retours arrière
    if (filePath.includes('..')) {
      res.statusCode = 400;
      res.end('Requête invalide');
      return;
    }
    const fullPath = __dirname + '/public' + filePath;
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Page non trouvée');
        return;
      }
      const ext = filePath.split('.').pop();
      const mimeTypes = {
        html: 'text/html',
        css: 'text/css',
        js: 'application/javascript',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        svg: 'image/svg+xml',
      };
      const mime = mimeTypes[ext] || 'text/plain';
      res.setHeader('Content-Type', mime);
      res.end(data);
    });
    return;
  }

  // Méthodes non supportées
  res.statusCode = 404;
  res.end('Ressource non trouvée');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});