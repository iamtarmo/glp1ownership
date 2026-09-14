/* Meta Pixel — GLP-1 Ownership (dataset 1424946666236268).
   Loaded on every funnel page. Pages render client-side, so all
   event hooks are delegated from document rather than bound to
   elements that may not exist yet. */
(function (f, b, e, v, n, t, s) {
  if (f.fbq) return;
  n = f.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  t = b.createElement(e);
  t.async = true;
  t.src = v;
  s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s);
})(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

(function () {
  'use strict';

  var PIXEL_ID = '1424946666236268';
  var PRICE = 17.0;
  var CURRENCY = 'USD';
  var PRODUCT = 'GLP-1 Ownership Protocol';

  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');

  // Guards a one-time event against repeat visits (bookmark, link in the
  // confirmation email). Storage can throw in private mode, so never let it break tracking.
  function firedBefore(key) {
    try {
      if (localStorage.getItem(key)) return true;
      localStorage.setItem(key, '1');
      return false;
    } catch (e) {
      return false;
    }
  }

  var path = location.pathname;

  // --- Squeeze and checkout pages: someone is looking at the offer ---
  if (path === '/' || path.indexOf('/checkout') === 0) {
    fbq('track', 'ViewContent', {
      content_name: PRODUCT,
      value: PRICE,
      currency: CURRENCY,
    });
  }

  // --- Handing off to Stripe ---
  document.addEventListener(
    'click',
    function (event) {
      var link = event.target.closest && event.target.closest('a[href*="buy.stripe.com"]');
      if (link) {
        fbq('track', 'InitiateCheckout', {
          content_name: PRODUCT,
          value: PRICE,
          currency: CURRENCY,
        });
      }
    },
    true
  );

  // --- Quiz: unlocking the result is the lead ---
  if (path.indexOf('/quiz') === 0) {
    document.addEventListener(
      'click',
      function (event) {
        var el = event.target.closest && event.target.closest('button');
        if (!el) return;
        if (/see my result/i.test(el.textContent || '')) {
          if (!firedBefore('fb_lead_fired')) {
            fbq('track', 'Lead', { content_name: 'Ownership Quiz' });
          }
        }
      },
      true
    );
  }

  // --- Access page: only a genuine arrival from Stripe counts as a purchase ---
  if (path.indexOf('/access-') === 0) {
    var params = new URLSearchParams(location.search);
    var cameFromStripe =
      params.has('session_id') || /(^|\.)stripe\.com$/.test(documentReferrerHost());

    if (cameFromStripe && !firedBefore('fb_purchase_fired')) {
      fbq('track', 'Purchase', {
        content_name: PRODUCT,
        value: PRICE,
        currency: CURRENCY,
      });
    }
  }

  function documentReferrerHost() {
    try {
      return document.referrer ? new URL(document.referrer).hostname : '';
    } catch (e) {
      return '';
    }
  }
})();
