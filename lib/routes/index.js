var express = require('express');
var router = express.Router();

var schedule = require('../schedule');

router.get('/', schedule.provider, function(req, res, err) {
  var readCache = req.query.flush === undefined;
  schedule.read(readCache, function(err, games, teams) {
    if (err) {
      return next(err);
    }

    var team = null;
    if (req.query.team && teams.indexOf(req.query.team) === -1) {
      var redirectUrl = '/';
      if (req.cableProvider) {
        redirectUrl += '?provider=' + req.cableProvider;
      }
      return res.redirect(redirectUrl);
    } else if (req.query.team) {
      team = req.query.team;
    }

    res.render('index', {
      provider: req.cableProvider,
      providers: schedule.PROVIDERS,
      title: 'Is Hockey on TV?',
      team: team,
      teams: teams? teams.sort() : [],
      games: games
    });
  });
});

module.exports = router;
