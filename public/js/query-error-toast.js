(function () {
  if (window.__queryToastRendered) return;
  window.__queryToastRendered = true;

  var params = new URLSearchParams(window.location.search);
  var message = params.get('error') || params.get('success') || params.get('info');
  if (!message) return;

  var mode = params.get('error') ? 'error' : params.get('success') ? 'success' : 'info';
  message = decodeURIComponent(String(message).replace(/\+/g, ' '));

  var classes = {
    error: 'alert-danger',
    success: 'alert-success',
    info: 'alert-info'
  };
  var labels = {
    error: 'Please fix: ',
    success: 'Success: ',
    info: 'Info: '
  };

  var div = document.createElement('div');
  div.className = 'alert ' + classes[mode] + ' alert-dismissible fade show';
  div.setAttribute('role', 'alert');
  div.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:9999;max-width:min(560px,92vw);box-shadow:0 4px 12px rgba(0,0,0,.15);';

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn-close';
  close.setAttribute('aria-label', 'Close');
  close.onclick = function () {
    if (div.parentNode) div.parentNode.removeChild(div);
  };

  var msg = document.createElement('div');
  var strong = document.createElement('strong');
  strong.textContent = labels[mode];
  var span = document.createElement('span');
  span.textContent = message;
  msg.appendChild(strong);
  msg.appendChild(span);

  div.appendChild(close);
  div.appendChild(msg);
  document.body.insertBefore(div, document.body.firstChild);

  setTimeout(function () {
    if (div.parentNode) div.parentNode.removeChild(div);
  }, 5000);

  var clean = window.location.pathname + (window.location.hash || '');
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', clean);
  }
})();
