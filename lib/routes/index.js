var express = require('express');
var router = express.Router();

var _ = require('lodash');

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

    // Filter games and determine channel information
    var filtered = [];
    var provider= req.cableProvider;
    games.forEach(function(game) {
      // If game does not have a home or away team ignore it
      if (!game.home || !game.away) { return; }
      // If we have a team filter, ignore other games
      if (team && !(game.home === team || game.away === team)) { return; }

      // No channels found
      if (!game.channels) {
        game.channelOutput = '-';

      // Find channel numbers
      } else {
        var channels = [];
        var notAvailable = false;
        game.channels.forEach(function(chans) {
          var res = chans[provider];
          if (res === null) {
            notAvailable = true;
          } else if (_.isArray(res)) {
            channels.push('Regional (' + res.join(',') + ')');
          } else {
            channels.push(res);
          }
        });

        if (channels.length > 0) {
          game.channelOutput = channels.join(', ');
        } else {
          game.channelOutput = 'N/A';
        }
      }

      filtered.push(game);
    });

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
