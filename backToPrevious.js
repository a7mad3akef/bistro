var Botkit = require('./lib/Botkit.js');
var mongoStorage = require('botkit-storage-mongo')({mongoUri: process.env.MONGODB_URI});
var controller = Botkit.facebookbot({
    debug: true,
    access_token: process.env.page_token,
    verify_token: process.env.verify_token,
    storage: mongoStorage,
});

module.exports = {
    // Send user back to the last thread
    userThread: function (response, convo) {
        controller.storage.users.get(response.user, function(err, user) {
            lastThread = user.last_thread;
            switch(lastThread) {
              case 'gitIntro': gifIntro(response, convo); break;
              case 'testCategories': testCategories(response, convo); break;
              case 'introApply': introApply(response, convo); break;
              case 'applyStart': applyStart(response, convo); break;
              case 'numberPlate_F': numberPlate_F(response, convo); break;
              case 'whereAreYou': address = ''; addressComponents = ''; landmark1 = ''; landmark2 = ''; sangkat = ''; delete address; delete addressComponents; delete landmark1; delete landmark2; delete sangkat; whereAreYou(response, convo); break;
              case 'shareGuarantor': shareGuarantor(response, convo); break;
              case 'identity_F' : identity_F(response, convo); break;
              default: gifIntro(response, convo);
          }
      });
    }
};