var schedule = exports; exports.constructor = function schedule(){};

var cheerio = require('cheerio');
var request = require('request');

var redis = require('./redis');

var CACHE_KEY = 'schedule';
var CACHE_EXPIRY = 60 * 60 * 8;

var SCHEDULE_URL = 'http://www.nhl.com/ice/schedulebyseason.htm';
var USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36';

/**
 * Supported providers
 */

var PROVIDERS = [
  'Bell-Aliant'
];

schedule.PROVIDERS = PROVIDERS;

var DEFAULT_PROVIDER = 'Bell-Aliant';

/**
 * Massive ridiculous list of providers and channel numbers
 */

var CHANNELS = {
  'CBC': {
    'Bell-Aliant': 400
  },
  'CITY': {
    'Bell-Aliant': 433
  },
  'CITYM': {
    'Bell-Aliant': null
  },
  'SN': {
    'Bell-Aliant': [610, 612, 614]
  },
  'SNE': {
    'Bell-Aliant': 610
  },
  'SNO': {
    'Bell-Aliant': 612
  },
  'SNP': {
    'Bell-Aliant': 614
  },
  'SN360': {
    'Bell-Aliant': 615
  },
  'SN1': {
    'Bell-Aliant': 616
  },
  'TVA': {
    'Bell-Aliant': 924
  },
  'TVA2': {
    'Bell-Aliant': 925
  },
  'FX-CA': {
    'Bell-Aliant': 460
  },
  'HNIC': {
    'Bell-Aliant': 'Not assigned'
  }
};

/**
 * Check if requested provider is supported
 */
schedule.provider = function(req, res, next) {
  if (req.query.provider && PROVIDERS.indexOf(req.query.provider) === -1) {
    return res.redirect('/');
  }

  req.cableProvider = req.query.provider || DEFAULT_PROVIDER;

  next();
};

/**
 * Scrape or read cache
 *
 * @param boolean readCache - whether to read the cache
 * @param function cb - callback
 */
schedule.read = function(readCache, cb) {
  if (typeof readCache === 'function') {
    cb = readCache;
    readCache = true;
  }

  if (!readCache) {
    return schedule.refresh(cb);
  }

  // Read cache key for data
  redis.client.get(CACHE_KEY, function(err, val) {
    if (err) {
      console.error('cache read error', err);
      return cb(err);
    }

    // If not found, scrape and store in cache
    if (!val) {
      return schedule.refresh(cb);
    }

    var games;
    try {
      games = JSON.parse(val);
    } catch(e) {
      return cb(e);
    }

    cb(null, games);
  });
};

/**
 * Refresh the cache
 *
 * @param function cb - callback
 */
schedule.refresh = function(cb) {
  schedule.scrape(function(err, games) {
    if (err) {
      console.error('scrape error', err);
      return cb(err);
    }

    console.log('scrape complete.');
    schedule.store(games, function(err) {
      if (err) {
        console.error('store error', err);
        return cb(err);
      }

      cb(null, games);
    });
  });
};

/**
 * Store game data in redis
 *
 * @param array games - list of games data
 * @param function cb - callback
 */
schedule.store = function(games, cb) {
  var data = JSON.stringify(games);
  redis.client.set(CACHE_KEY, data, function(err) {
    if (err) {
      return cb(err);
    }

    console.log('cache data stored.');
    redis.client.expire(CACHE_KEY, CACHE_EXPIRY, function(err) {
      if (err) {
        return cb(err);
      }

      console.log('cache expiry set.');
      cb();
    });
  });
};

/**
 * Read the remote NHL.com schedule
 *
 * @param function cb - callback
 */
schedule.scrape = function(cb) {
  var games = [];

  // Read the remote NHL.com schedule
  request({
    url: SCHEDULE_URL,
    headers: {
      'User-Agent': USER_AGENT
    }
  }, function(err, res, body) {
    if (err) {
      return cb(err);
    }
    if (res.statusCode !== 200) {
      return cb(new Error('Website returned ' + res.statusCode));
    }
  
    // Use DOM environment to parse through HTML easier
    var $ = cheerio.load(body);
    var $rows = $('table.schedTbl').first().find('tr');

    // Loop all rows and parse games
    $rows.each(_parseRow);

    // Parse the HTML row into values
    function _parseRow() {
      var $el = $(this);
      var game = {};

      // Pull the column data
      game.date = $el.find('td.date div').first().text();
      game.time = $el.find('td.time div').first().text();
      game.tvInfo = $el.find('td.tvInfo').text();

      var $teams = $el.find('td.team');
      $teams.each(function(i) {
        var name = i === 0? 'away' : 'home';
        game[name] = $(this).text();
      });

      games.push(schedule.translate(game));
    }

    cb(null, games);
  });
};

/**
 * Channel translation
 *
 * @param object game - game object
 * @returns object
 */
schedule.translate = function(game) {
  console.log('---');
  var tvInfo = game.tvInfo;
  if (!tvInfo) {
    game.channels = null;
    return game;
  }

  var channels = tvInfo.split(',');
  channels.forEach(function(code) {
    var numbers = CHANNELS[code.trim().toUpperCase()];
    if (numbers && !game.channels) {
      game.channels = numbers;
    }
  });

  console.log(!!tvInfo, game.home, game.away, game.channels);

  return game;
};
