var request = require('request');

// Generates a token from supplied payload
module.exports.formatMoney = function (n, c, d, t) {
  var c = isNaN(c = Math.abs(c)) ? 2 : c,
    d = d == undefined ? "." : d,
    t = t == undefined ? "," : t,
    s = n < 0 ? "-" : "",
    i = parseInt(n = Math.abs(+n || 0).toFixed(c)) + "",
    j = (j = i.length) > 3 ? j % 3 : 0;
  return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
};

module.exports.convertUSDAmount = function (amount, cur) {
  var v = amount * cur.rate;
  // if (cur.buffer_ammout != undefined && !isNaN(parseFloat(cur.buffer_ammout))) {
  //   v = v + (v * cur.buffer_ammout)
  // }
  return Math.ceil(v)
};
module.exports.randomString = function(length) {
    var result = '';
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
};

module.exports.performRequest = function(method, url, params, callback) {
  if (typeof params == 'function') {
    callback = params;
  } 
  else if (typeof callback != 'function') {
    callback = handleResponse;
  }

  if (method == 'get') {
    if (typeof params == 'object') {
      url = buildUrl(url, params);
    }
    request.get(url, callback);
  } else if (method == 'post') {
    var requestParams = { url: url };
    if (typeof params == 'object') {
      requestParams.form = params;
    }
    request.post(requestParams, callback);
  }
}

module.exports.buildRedirectUrl=function(url,token){
  var fullUrl = url;
  if (url.indexOf("?")!=-1){
    fullUrl+="&";
  }else{
    fullUrl+="?"
  }

  fullUrl+="token="+token;

  return fullUrl;
};


function buildUrl(url, params) {
  var queryParams = '';

  for (property in params) {
    if (params.hasOwnProperty(property)) {
      if (queryParams == '') {
        queryParams += property + '=' + params[property];
      } else {
        queryParams += '&' + property + '=' + params[property];
      }
    }
  }

  return url + '?' + queryParams;
}

function handleResponse(err, httpResponse, body) {
    if (err) {
      sails.log.error('Error returned from request',  err);
    } else {
      sails.log.info('Body returned from request: ', body);
    }
}
