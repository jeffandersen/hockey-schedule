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
  'BELL ALIANT',
  'BELL FIBE'
];

schedule.PROVIDERS = PROVIDERS;

var DEFAULT_PROVIDER = 'BELL ALIANT';

/**
 * Massive ridiculous list of providers and channel numbers
 */

var CHANNELS = {
  'CBC': {
    'BELL FIBE': 205,
    'BELL ALIANT': 400
  },
  'CITY': {
    'BELL FIBE': 204,
    'BELL ALIANT': 433
  },
  'CITYM': {
    'BELL FIBE': null,
    'BELL ALIANT': null
  },
  'SN': {
    'BELL FIBE': [406, 405, 407],
    'BELL ALIANT': [610, 612, 614]
  },
  'SNE': {
    'BELL FIBE': 406,
    'BELL ALIANT': 610
  },
  'SNO': {
    'BELL FIBE': 405,
    'BELL ALIANT': 612
  },
  'SNP': {
    'BELL FIBE': 407,
    'BELL ALIANT': 614
  },
  'SN360': {
    'BELL FIBE': 410,
    'BELL ALIANT': 615
  },
  'SN1': {
    'BELL FIBE': 418,
    'BELL ALIANT': 616
  },
  'TVA': {
    'BELL FIBE': 111,
    'BELL ALIANT': 924
  },
  'TVA2': {
    'BELL FIBE': null,
    'BELL ALIANT': 925
  },
  'FX-CA': {
    'BELL FIBE': null,
    'BELL ALIANT': 460
  },
  'HNIC': {
    'BELL FIBE': 'Not assigned',
    'BELL ALIANT': 'Not assigned'
  }
};

/**
 * Check if requested provider is supported
 */
schedule.provider = function(req, res, next) {
  if (req.query.provider && PROVIDERS.indexOf(req.query.provider) === -1) {
    var redirectUrl = '/';
    if (req.query.team) {
      redirectUrl += '?team=' + req.query.team;
    }
    return res.redirect(redirectUrl);
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

    var data;
    try {
      data = JSON.parse(val);
    } catch(e) {
      return cb(e);
    }

    cb(null, data.games, data.teams);
  });
};

/**
 * Refresh the cache
 *
 * @param function cb - callback
 */
schedule.refresh = function(cb) {
  schedule.scrape(function(err, games, teams) {
    if (err) {
      console.error('scrape error', err);
      return cb(err);
    }

    console.log('scrape complete.');
    schedule.store(games, teams, function(err) {
      if (err) {
        console.error('store error', err);
        return cb(err);
      }

      cb(null, games, teams);
    });
  });
};

/**
 * Store game data in redis
 *
 * @param array games - list of games data
 * @param array teams - list of team names
 * @param function cb - callback
 */
schedule.store = function(games, teams, cb) {
  var data = JSON.stringify({ games: games, teams: teams });
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
  var teams = [];

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
        var team = $(this).text();
        game[name] = team;
        if (teams.indexOf(team) === -1) {
          teams.push(team);
        }
      });

      games.push(schedule.translate(game));
    }

    cb(null, games, teams);
  });
};

/**
 * Channel translation
 *
 * @param object game - game object
 * @returns object
 */
schedule.translate = function(game) {
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

  return game;
};
