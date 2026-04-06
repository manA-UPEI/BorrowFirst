const express = require('express');
const path = require('path');

function createPageRoutes(viewsDir) {
  const router = express.Router();

  function sendView(fileName) {
    return (req, res) => {
      res.sendFile(path.join(viewsDir, fileName));
    };
  }

  router.get('/', (req, res) => {
    if (req.session.userId) {
      res.redirect('/home');
      return;
    }

    res.redirect('/login');
  });

  router.get('/login', sendView('login.html'));
  router.get('/register', sendView('register.html'));
  router.get('/home', sendView('home.html'));
  router.get('/borrowing', sendView('borrowing.html'));
  router.get('/listings', sendView('listings.html'));
  router.get('/product/:id', sendView('product.html'));
  router.get('/confirm/:id', sendView('confirm.html'));
  router.get('/requests', sendView('requests.html'));
  router.get('/profile', sendView('profile.html'));
  router.get('/payment', sendView('payment.html'));

  return router;
}

module.exports = createPageRoutes;
