var async = require("async");
var GitHubApi = require("github");
var readColors = require("colors/safe");

function GHOrgOverview(options) {
	this.options = options;
	this.github = new GitHubApi({
		version: "3.0.0"
	});
}
module.exports = GHOrgOverview;

function parseLinks(link) {
	var re = /<([^>]+)>;\s+rel="([a-z]+)"/g;
	var links = {};
	var match;
	while(match = re.exec(link)) {
		links[match[2]] = match[1];
	}
	return links;
}

function all(api, data, callback) {
	data.per_page = 100;
	data.page = 1;
	var list = [];
	api(data, function onResult(err, result) {
		if(err) return callback(err);
		var links = parseLinks(result.meta.link);
		list = list.concat(result);
		if(!links.next) {
			return callback(null, list);
		}
		data.page++;
		api(data, onResult);
	});
}

GHOrgOverview.prototype.load = function(callback) {
	this.github.authenticate({
		type: "oauth",
		token: this.options.token
	});
	var org = this.options.org;
	all(this.github.repos.getFromOrg, {
		org: org
	}, function(err, result) {
		if(err) return callback(err);
		this.repos = result.map(function(repo) {
			return {
				id: repo.id,
				name: repo.name,
				fullName: repo.full_name
			};
		});
		async.forEach(this.repos, function(repo, callback) {
			all(this.github.gitdata.getAllReferences, {
				user: org,
				repo: repo.name
			}, function(err, result) {
				if(err) return callback(err);
				repo.tags = {};
				repo.heads = {};
				repo.references = result.map(function(ref) {
					var s = ref.ref.split("/");
					var sha = ref.object.sha;
					return {
						type: s[1],
						name: s[2],
						sha: sha,
						objectType: ref.object.type,
						ref: ref
					};
				});
				async.forEach(repo.references, function(ref, callback) {
					if(ref.objectType === "tag") {
						this.github.gitdata.getTag({
							user: org,
							repo: repo.name,
							sha: ref.sha
						}, function(err, result) {
							if(err) return callback(err);
							ref.sha = result.object.sha;
							callback();
						});
					} else callback();
				}.bind(this), function(err) {
					if(err) return callback(err);
					repo.references.forEach(function(ref) {
						switch(ref.type) {
						case "heads":
							repo.heads[ref.name] = ref.sha;
							break;
						case "tags":
							repo.tags[ref.name] = ref.sha;
							break;
						}
					});
					repo.publishedVersion = Object.keys(repo.tags).filter(function(tag) {
						return repo.heads.master === repo.tags[tag];
					})[0];
					this.github.gitdata.getCommit({
						user: org,
						repo: repo.name,
						sha: repo.heads.master
					}, function(err, result) {
						if(err) return callback(err);
						repo.date = result.committer.date;
						repo.message = result.message;
						callback();
					});
				}.bind(this));
			}.bind(this));
		}.bind(this), function(err) {
			if(err) return callback(err);
			this.repos.sort(function(a, b) {
				if(a.date < b.date) return -1;
				if(a.date > b.date) return 1;
				return 0;
			});
			callback();
		}.bind(this));
	}.bind(this));
};

function identity(str) { return str; }

GHOrgOverview.prototype.toString = function(options) {
	options = options || {};
	var lines = [];
	var colors = {
		bold: options.colors ? readColors.bold : identity,
		green: options.colors ? readColors.green : identity,
		red: options.colors ? readColors.red : identity,
		yellow: options.colors ? readColors.yellow : identity
	};
	lines.push(this.repos.length + " repos:");
	this.repos.forEach(function(repo) {
		var line = colors.bold(repo.fullName);
		if(repo.publishedVersion) {
			line += colors.green(" published as " + repo.publishedVersion);
		} else if(Object.keys(repo.tags).length > 0) {
			line += colors.red(" not published: " + repo.date + " " + repo.message.split("\n")[0]);
		} else {
			line += colors.yellow(" no tags: " + repo.date + " " + repo.message.split("\n")[0]);
		}
		lines.push(line);
	});
	return lines.join("\n");
};
