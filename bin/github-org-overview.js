#!/usr/bin/env node
var path = require("path");
var fs = require("fs");
var prompt = require("prompt");
var argv = require("minimist")(process.argv.slice(2));;
var GHOrgOverview = require("../");

var configFile = path.resolve(__dirname, "../config.json");

function loadConfiguration(callback) {
	fs.exists(configFile, function(exist) {
		if(exist && argv.configure) {
			var prevConfig = require(configFile);
			prompt.get(["org"], function(err, result) {
				var config = {
					token: prevConfig.token,
					org: result.org
				};
				fs.writeFile(configFile, JSON.stringify(config), function(err) {
					if(err) return callback(err);
					callback(null, config);
				});
			});
		} else if(exist && !argv.reconfigure) {
			console.log("Using configuration, pass --configure to reconfigure org, pass --reconfigure to reconfigure org and token.");
			callback(null, require(configFile));
			return;
		} else {
			prompt.get(["token", "org"], function(err, result) {
				var config = {
					token: result.token,
					org: result.org
				};
				fs.writeFile(configFile, JSON.stringify(config), function(err) {
					if(err) return callback(err);
					callback(null, config);
				});
			});
		}
	});
}

loadConfiguration(function(err, configuration) {
	if(err) {
		console.error(err);
		return;
	}
	if(argv._[0]) {
		configuration.org = argv._[0];
	}
	var api = new GHOrgOverview(configuration);
	api.load(function(err) {
		if(err) {
			console.error(err);
			return;
		}
		console.log(api.toString({
			colors: require("supports-color")
		}));
	});
});
