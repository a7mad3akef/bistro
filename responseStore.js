var Botkit = require('./lib/Botkit.js');
var mongoStorage = require('botkit-storage-mongo')({mongoUri: process.env.MONGODB_URI});
var controller = Botkit.facebookbot({
    debug: true,
    access_token: process.env.page_token,
    verify_token: process.env.verify_token,
    storage: mongoStorage,
});

module.exports = {
// with Callback
/*toDatabase: function(key, value, response) {
    //Check user ID and store response in Mongo database
    controller.storage.users.get(response.user, function(err, user) {
        if (!user) {
            console.log("Saving info for new user: " + user);
            user = {
                id: response.user,
            };
        }
        console.log("Saving info for existing user: " + user);
        user[key] = value;
        controller.storage.users.save(user, function(err, id) {
            if(err) {console.log("ERROR SAVING");} else console.log('its OK SAVING bong');
        });
    });
}
};*/

toDatabase: function(applicant, response) {
    //Check user ID and store response in Mongo database
    controller.storage.users.get(response.user, function(err, user) {
        if (!user) {
            console.log("Push info for new user: " + response.id);
            user = {
                id: response.user,
            };
        }
        console.log("Push info for existing user: " + user.id);
        Object.keys(applicant).forEach(function(key) {
            console.log('Saved => ' + key + ': ' + applicant[key]);
            user[key] = applicant[key];
            controller.storage.users.save(user, function(err, id) {
                if(err) console.log("ERROR SAVING: " + err); 
            });
        });
    });
}
};



/*
    // with Promise (necesary for Passport login)
    toDatabase: function(key, value, response) {
        return new Promise (function(resolve, reject) {
            controller.storage.users.get(response.user, function(err, user) {
                if (err) {
                    reject(err);
                } else if (!user) {
                    user = {
                    id: response.user,
                };
            }
            console.log("IN THE NAVY");
            user[key] = value;
            resolve(controller.storage.users.save(user, function(err, id) {
                if(err) {
                    console.log('ERROR SAVING');
                } else {
                    console.log('its OK SAVING bong');
                }
            })
            );
        });
        });
    }
};
*/
