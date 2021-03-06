'use strict';

var express             = require('express'),
  compression           = require('compression'),
  morgan                = require('morgan'),
  bodyParser            = require('body-parser'),
  session               = require('express-session'),
  shopifyApiController  = require('./controllers/shopify_api'),
  shopifyAuthController = require('./controllers/shopify_auth'),
  shopifyAPI            = require('shopify-node-api');
  // url                   = require('url');

var port = process.env.PORT || 3000,
  development = (process.env.ENV == 'development'),
  esdk = (process.env.ESDK == 'true'),
  shopifyOptions = {
    shopify_api_key:       process.env.SHOPIFY_APP_API_KEY,
    shopify_shared_secret: process.env.SHOPIFY_APP_API_SECRET,
    shopify_scope:        'read_products,write_products',
    redirect_uri:          (process.env.SHOPIFY_REDIRECT_URI || 'http://localhost:3000') + '/auth_token',
    access_token:          process.env.TOKEN,
    shop:                  process.env.SHOP,
    namespaces: {
      watch: 'playmakers-watch',
      sync:  'playmakers-sync'
    }
  },
  Shopify = new shopifyAPI(shopifyOptions);

var app = express();
app.use(compression());

// statically serve from the 'public' folder
app.use(express.static(__dirname + '/public'));

// log all requests
app.use(morgan('combined'));

// parse application/json
app.use(bodyParser.json());

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
  extended: false
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
}));

// use jade templating engine for view rendering
app.set('view engine', 'jade');

// use the environment's port if specified
app.set('port', port);

if (development) {
  console.log('Starting in Development Mode');
  var browserify_express = require('browserify-express');

  app.use(browserify_express({
      entry: __dirname + '/client/init.js',
      watch: __dirname + '/client',
      mount: 'script.js',
      write_file: __dirname + '/public/scripts.js',
      verbose: true,
      minify: true
  }));

  app.all('*', function(req, res, next) {
    req.session.shop         = shopifyOptions.shop;
    req.session.access_token = shopifyOptions.access_token;
    next();
  });
}


// --------------------- routes
app.get('/', function (req, res) {
  res.render('index');
});

app.get('/login', function (req, res) {
  res.render('login');
});

var shopifyAuth = new shopifyAuthController.ShopifyAuth(shopifyOptions, '/login', '/auth', '/');
app.get('/auth',       shopifyAuth.startAuth);
app.get('/auth_token', shopifyAuth.getAccessToken);


var product_action = function(template_name, title, back_url, namespace) {
  return function(req, res) {
    res.render(template_name, {
      esdk: esdk,
      apiKey: shopifyOptions.shopify_api_key,
      shopUrl: (req.session.shop || shopifyOptions.shop),
      title: title,
      back_url: back_url,
      namespace: namespace
    });
  }
}

app.get('/products/watch', shopifyAuth.requireAuth,
  product_action('product_watch', 'Marktanalyse', '/products/watch/config', shopifyOptions.namespaces.watch)
);
app.get('/products/watch/config', shopifyAuth.requireAuth,
  product_action('product_metafields', 'Marktanalyse - Einstellungen', '/products/watch', shopifyOptions.namespaces.watch)
);

app.get('/products/sync', shopifyAuth.requireAuth,
  product_action('product_sync',  'Bestandssyncro', '/products/sync/config', shopifyOptions.namespaces.sync)
);
app.get('/products/sync/config', shopifyAuth.requireAuth,
  product_action('product_metafields', 'Bestandssyncro - Einstellungen', '/products/sync', shopifyOptions.namespaces.sync)
);

var shopifyApi = new shopifyApiController.ShopifyApi(shopifyOptions);
app.all('/shopify/*', shopifyAuth.requireAuth);
app.route('/shopify/products.json')
  .get(shopifyApi.getProducts)
app.route('/shopify/products/:product_id/metafields.json')
  .get(shopifyApi.getProductMetafields)
app.route(/^\/shopify\/([^.]+)\.json$/)
  .get(shopifyApi.get)
  .post(shopifyApi.post)
  .put(shopifyApi.put)
  .patch(shopifyApi.put)
  .delete(shopifyApi.delete);


// --------------------- start server
app.listen(app.get('port'), function() {
  console.log('Listening on port ' + app.get('port'));
});
