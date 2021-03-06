//////////////////////////////////////////////////////////////////
// MCD
// Additional search to use when postcode is present in the text.
// Based on AddressesUsingIdsQuery.js in pelias-query
// (which defines searches which must have street in the text)
// Have also copied /layout/Query.js and lib/leaf/*.js from pelias-query to save forking it.
//////////////////////////////////////////////////////////////////
const _ = require('lodash');
const Query = require('./Query');
const match_phrase = require('../lib/leaf/match_phrase');

function createHouseNumberAndPostcodeShould(vs) {
  const should = {
    bool: {
      _name: 'fallback.address',
      must: [
        match_phrase('address_parts.number', vs.var('input:housenumber')),
        match_phrase('address_parts.zip', vs.var('input:postcode'), {
          analyzer: vs.var('address:postcode:analyzer')
        })
      ],
      filter: {
        term: {
          layer: 'address'
        }
      }
    }
  };

  if (vs.isset('boost:address')) {
    should.bool.boost = vs.var('boost:address');
  }

  return should;
}

function createUnitAndHouseNumberAndPostcodeShould(vs) {
  const should = {
    bool: {
      _name: 'fallback.address',
      must: [
        match_phrase('address_parts.unit', vs.var('input:unit')),
        match_phrase('address_parts.number', vs.var('input:housenumber')),
        match_phrase('address_parts.zip', vs.var('input:postcode'), {
          analyzer: vs.var('address:postcode:analyzer')
        })
      ],
      filter: {
        term: {
          layer: 'address'
        }
      }
    }
  };

  if (vs.isset('boost:address')) {
    should.bool.boost = vs.var('boost:address');
  }

  return should;
}


function createPostcodeShould(vs) {
  const should = {
    bool: {
      _name: 'fallback.postcode',
      must: [
        match_phrase('address_parts.zip', vs.var('input:postcode'), {
          analyzer: vs.var('address:postcode:analyzer')
        })
      ],
      filter: {
        term: {
          layer: 'address'
        }
      }
    }
  };

  if (vs.isset('boost:address')) {
    should.bool.boost = vs.var('boost:address');
  }

  return should;

}

function createLayerIdsShould(layer, ids) {
  // create an object initialize with terms.'parent.locality_id' (or whatever)
  // must use array syntax for 2nd parameter as _.set interprets '.' as new object
  return _.set({}, ['terms', `parent.${layer}_id`], ids);
}

class PostcodeUsingIdsQuery extends Query {
  constructor() {
    super();
  }

  render(vs) {
    // establish a base query with 'postcode' should condition and size/track_scores
    const base = {
      query: {
        function_score: {
          query: {
            bool: {
              minimum_should_match: 1,
              should: [
                createPostcodeShould(vs)
              ]
            }
          }
        }
      },
      size: vs.var('size'),
      track_scores: vs.var('track_scores')
    };

    // add unit/housenumber/postcode if available
    if (vs.isset('input:housenumber') && vs.isset('input:unit')) {
      base.query.function_score.query.bool.should.push(createUnitAndHouseNumberAndPostcodeShould(vs));
    }
    else if (vs.isset('input:housenumber')) {
      base.query.function_score.query.bool.should.push(createHouseNumberAndPostcodeShould(vs));
    }

    // if there are layer->id mappings, add the layers with non-empty ids
    if (vs.isset('input:layers')) {
      // using $ due to reference object and not scalar object
      const layers_to_ids = vs.var('input:layers').$;

      // add the layers-to-ids 'should' conditions
      // if layers_to_ids is:
      // {
      //   locality: [1, 2],
      //   localadmin: [],
      //   region: [3, 4]
      // }
      // then this adds the results of:
      // - createShould('locality', [1, 2])
      // - createShould('region', [3, 4])
      // to an array
      const id_filters = Object.keys(layers_to_ids).reduce((acc, layer) => {
        if (!_.isEmpty(layers_to_ids[layer])) {
          acc.push(createLayerIdsShould(layer, layers_to_ids[layer]));
        }
        return acc;
      }, []);

      // add filter.bool.minimum_should_match and filter.bool.should,
      //  creating intermediate objects as it goes
      _.set(base.query.function_score.query.bool, 'filter.bool', {
        minimum_should_match: 1,
        should: id_filters
      });

    }

    // add any scores (_.compact removes falsey values from arrays)
    if (!_.isEmpty(this._score)) {
      base.query.function_score.functions = _.compact(this._score.map(view => view(vs)));
    }

    // add any filters
    if (!_.isEmpty(this._filter)) {
      // add filter.bool.must, creating intermediate objects if they don't exist
      //  using _.set does away with the need to check for object existence
      // _.compact removes falsey values from arrays
      _.set(
        base.query.function_score.query.bool,
        'filter.bool.must',
        _.compact(this._filter.map(view => view(vs))));

    }

    return base;
  }

}

module.exports = PostcodeUsingIdsQuery;
