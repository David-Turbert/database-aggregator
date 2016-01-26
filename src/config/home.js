'use strict';

const fs = require('fs');
const path = require('path');

const debug = require('debug')('config:home');

const mainConfigPath =
    process.env.DATABASE_AGGREGATOR_CONFIG ||
    path.resolve(require('os').homedir(), '.database-aggregator-config');

debug(`main config path is ${mainConfigPath}`);

exports.CONFIG_FILE = mainConfigPath;
exports.config = getHomeConfig();

function getHomeConfig() {
    try {
        const config = JSON.parse(fs.readFileSync(mainConfigPath, 'utf8'));
        if (config.homeDir) {
            config.homeDir = path.resolve(mainConfigPath, '..', config.homeDir);
            debug(`homeDir is ${config.homeDir}`);
        }
        return config;
    } catch (e) {
        if (e.code === 'ENOENT') {
            debug('no main config found');
        } else {
            debug.error('Error while reading and parsing config file' + '\n' + e);
        }
        return {};
    }
}

exports.get = function (key) {
    return exports.config[key];
};

exports.set = function (key, value) {
    if (!key) {
        throw new Error('key is mandatory');
    }
    const currentConfig = getHomeConfig();
    currentConfig[key] = value;
    fs.writeFileSync(mainConfigPath, JSON.stringify(currentConfig));
    exports.config = currentConfig;
};