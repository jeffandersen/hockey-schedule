var redis = exports; exports.constructor = function redis(){};

var url = require('url');
var redisLib = require('redis');

redis.initialize = function(cb) {
  var redisUrl = process.env.REDISCLOUD_URL;

  // if rediscloud is enabled use that
  if (redisUrl) {

    var opts = {
      no_ready_check: true
    };

    redisUrl = url.parse(redisUrl);

    var port = redisUrl.port;
    var hostname = redisUrl.hostname;

    redis.client = redisLib.createClient(port, hostname, opts);
    redis.client.auth(redisUrl.auth.split(":")[1]);
  
  // otherwise look for localhost
  } else {
    redis.client = redisLib.createClient();
  }

  redis.client.on('ready', cb);
  redis.client.on('error', function(err) {
    console.error('redis client error', err);
  });
};
