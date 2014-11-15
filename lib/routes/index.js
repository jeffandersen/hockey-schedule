var express = require('express');
var router = express.Router();

var schedule = require('../schedule');

router.get('/', schedule.provider, function(req, res, err) {
  var readCache = req.query.flush === undefined;
  schedule.read(readCache, function(err, games) {
    if (err) {
      return next(err);
    }

    res.render('index', {
      provider: req.cableProvider,
      providers: schedule.PROVIDERS,
      title: 'Is Hockey on TV?',
      games: games
    });
  });
});

module.exports = router;
