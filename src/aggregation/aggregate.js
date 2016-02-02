'use strict';

const Promise = require('bluebird');
const seqIdTrack = require('./../mongo/models/seqIdAggregated');
const config = require('./../config/config').globalConfig;
const aggregation = require('./../mongo/models/aggregation');
const source = require('./../mongo/models/source');
const debug = require('./../util/debug')('aggregation');
const seqId = require('./../mongo/models/seqIdCount');
const connection = require('../mongo/connection');
const isequal = require('lodash.isequal');

module.exports = function (aggregateDB) {
    debug.trace('get common ids');
    var conf = config.aggregation[aggregateDB];
    if (!conf) return Promise.reject(new Error(`No aggregation configuration for ${aggregateDB}`));


    var sourceNames = Object.keys(conf.sources);
    var maxSeqIds = {};


    return Promise.coroutine(function * () {
        yield connection();
        console.log('connected');
        let seqIds = yield seqIdTrack.getLastSeqIds(aggregateDB);
        seqIds = seqIds || {};
        console.log(seqIds)
        let commonIds = [];
        for(let i=0; i<sourceNames.length ;i++) {
            let sourceName = sourceNames[i];
            maxSeqIds[sourceName] = yield source.getLastSeqId(sourceName);
            let cids = yield source.getCommonIds(sourceName, seqIds[sourceName] || 0);
            cids = cids.map(commonId => commonId.commonID);
            commonIds = commonIds.concat(cids);
        }

        commonIds = new Set(commonIds);
        console.log(commonIds);

        for(let commonId of commonIds) {
            let data = {};
            for(let i=0; i<sourceNames.length; i++) {
                let sourceName = sourceNames[i];
                data[sourceName] = yield source.getByCommonId(sourceName, commonId);
            }
            let obj = {};
            obj.id = commonId;
            obj._id = commonId;
            obj.action = 'update';
            obj.date = Date.now();
            obj.value = aggregate(data, conf.sources);

            if (obj.value === null) return;

            let oldEntry = yield aggregation.findById(aggregateDB, commonId);
            oldEntry = oldEntry || {};
            //console.log('old entry ' + oldEntry.id, oldEntry.value);
            //console.log('new entry ' + obj.id, obj.value);
            if(isequal(obj.value, oldEntry.value)) {
                debug.debug(`Not saving ${aggregateDB}:${commonId} because has not changed`);
                return;
            }
            obj.seqid = yield seqId.getNextSequenceID('aggregation_' + aggregateDB);
            yield aggregation.save(aggregateDB, obj);
        }
    })();


    //return connection().then(() => {
    //    return seqIdTrack.getLastSeqIds(aggregateDB)
    //        .then(seqIds => {
    //            debug.trace(`last seq ids ${JSON.stringify(seqIds)}`);
    //            seqIds = seqIds || {};
    //            // Get commonID of entries that have seqid > seqId
    //            return Promise.all(sourceNames.map(sourceName => {
    //                return source.getCommonIds(sourceName, seqIds[sourceName] || 0)
    //                    .then(commonIds => {
    //                        maxSeqIds[sourceName] = commonIds[commonIds.length - 1].sequentialID;
    //                        return commonIds.map(commonId => commonId.commonID);
    //                    });
    //            }));
    //        })
    //        .then(setFromCommonIds)
    //        .then(commonIds => {
    //            commonIds = Array.from(commonIds);
    //            debug(`found commonIds that changed, ${commonIds}`);
    //            var prom = Promise.resolve();
    //            for (let i = 0; i < commonIds.length; i++) {
    //                let commonId = commonIds[i];
    //                prom = prom.then(() => {
    //                    return Promise.all(sourceNames.map(sourceName => {
    //                        return source.getByCommonId(sourceName, commonId);
    //                    })).then(data => {
    //                        var obj = {};
    //                        for (let j = 0; j < data.length; j++) {
    //                            obj[sourceNames[j]] = data[j];
    //                        }
    //                        return obj;
    //                    }).then(data => {
    //                        let obj = {};
    //                        obj.id = commonId;
    //                        obj._id = commonId;
    //                        obj.action = 'update';
    //                        obj.date = Date.now();
    //                        obj.value = aggregate(data, conf.sources);
    //
    //
    //                        if (obj.value === null) return;
    //                        return aggregation.findById(aggregateDB, commonId).then(oldEntry => {
    //                            oldEntry = oldEntry || {};
    //                            console.log('old entry', oldEntry.value);
    //                            console.log('new entry', obj.value);
    //                            if(isequal(obj.value, oldEntry.value)) {
    //                                debug.debug(`Not saving ${aggregateDB}:${commonId} because has not changed`);
    //                                return;
    //                            }
    //                            return seqId.getNextSequenceID('aggregation_' + aggregateDB).then(seqid => {
    //                                obj.seqid = seqid;
    //                                return aggregation.save(aggregateDB, obj);
    //                            });
    //                        });
    //                    });
    //                });
    //            }
    //            return prom;
    //        }).then(() => {
    //            return seqIdTrack.setSeqIds(aggregateDB, maxSeqIds);
    //        })
    //});
};

function setFromCommonIds(commonIds) {
    var s = new Set();
    for (let i = 0; i < commonIds.length; i++) {
        for (let j = 0; j < commonIds[i].length; j++) {
            s.add(commonIds[i][j]);
        }
    }
    return s;
}

function aggregate(data, filter) {
    var result = {};
    var accept = true;
    for (var key in filter) {
        if (data[key]) {
            accept = filter[key].call(
                null,
                data[key].map(d => d.data),
                result,
                data[key].length ? data[key][0].commonID : null,
                data[key].map(d => d._id));

            if (accept === false) {
                break;
            }
        }
    }
    if (accept === false) {
        return null;
    }
    return result;
}