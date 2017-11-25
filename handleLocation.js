var request = require('request'); // hanlde http get / post requests
// No module used for Nearby Search, Distance Matrix and Streetview Image API, directly from web service (URL request)
//Google APIs should be activated in Google Console: Geocode, DistanceMatrix, StreetView Javascript API, StreetView Image, Places, Cloud Vision
//Google Geocoder API, converts latitude and longitude into an address
var geocoder = require('geocoder');
// Google API, check pano location or id
var panoramaByLocation = require('google-panorama-by-location');

module.exports = {

	passToGoogleMapsApi : function(coordinates, callback) {
	//Check if user actually sends his CURRENT location
      /*if(response.attachments[0].title == 'Pinned Location') {
          convo.say('Please send your current location (do not move move the pin around!)');
          convo.say('Let\'s try again');
          whereAreYou(response, convo);
          convo.next();
      }*/
      var radius = 300;
      // To be modified depending of where the head office is actually located
      var headOfficeCoordinates = {lat:'11.556655475310068', long:'104.91955967029783'}; // for compputing travel time to from office to user's place
      var maxTransitTime = '70'; //in minutes
      var TransitTimeRequest = 'https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=' + headOfficeCoordinates.lat + ',' + headOfficeCoordinates.long + '&destinations=' + coordinates.lat + ',' + coordinates.long + '&mode=driving&units=metric&key=' + process.env.GoogleApiKey;
      //check the transit time to the applicant's home. If too long, reject
      console.log("LAT = " + coordinates.lat);
      console.log("LONG = " + coordinates.long);
      request({
        url: TransitTimeRequest,
        json: true
      }, function (error, response, body) {
        if(error || response.statusCode !== 200 || body.status !== 'OK') {
          console.log('Transit time request error:' + error);
          err = 'there was a problem 🤔 let\'s try again';
          callback(err, null);
        } 
        else if (body.rows[0].elements[0].duration.value < maxTransitTime*60) {
          var transitTime = Math.ceil(body.rows[0].elements[0].duration.value / 60 / 10) * 10;
          // Larger radius out of downtown for places nearby search
          if (transitTime >= 25) { radius = 800; }
          console.log('Transit time to applicant home (in min): ' + transitTime);        
          //converts coordinates to address. Nested because quicker than Google Places API
          geocoder.reverseGeocode(coordinates.lat, coordinates.long, function (err, data) {
            var address = data.results[0].formatted_address;
            var addressComponents = data.results[0].address_components;
            console.log('GEOCODING DATA: ' + JSON.stringify(data.results, null, 2));
            console.log('Formatted address from geocoding: ' + address);
            // if the 'neighbourhood category represent a very large district (a Khan), get the street instead
            if(data.results[1].address_components[0].short_name.indexOf('Khan ') === true) {
              sangkat = data.results[0].address_components[0].short_name;
              console.log('Fetching street: ' + sangkat + '*** not fetching neightbourhood: ' + data.results[1].address_components[0].short_name);
              res = [transitTime, radius, address, addressComponents, sangkat];
              callback(null, res);
              } 
              /*else {
              // For locations in Phnom Penh, neighborhood is the village or sangkat. In province, it is the sublocality level 1
               (data.results[0].address_components.indexOf('phnom penh')) {
                console.log('PHNOM PENH');
                localityType = 'neighborhood';
               } else  { 
                console.log('PROVINCE');
                localityType = 'sublocality_level_1';
              }*/
            // Find the neighborhood or sublocality type in address component and assign it to var sangkat
            /*for (var i=1; i<3; i++) {
              for (var j = 0; j < 3; j++) {
                if (data.results[i].address_components[j].types.indexOf(localityType) > -1) {
                  console.log("THE PHUM IS " + data.results[i].address_components[j].short_name);
                  sangkat = data.results[i].address_components[j].short_name;
                  break;
              }*/
              else {
                sangkat = data.results[1].address_components[0].short_name;
                console.log('Fetching neightbourhood: ' + sangkat + ' *** Not fetching street: ' + data.results[0].address_components[0].short_name);
                res = [transitTime, radius, address, addressComponents, sangkat];
                callback(null, res);
              }
              /*}
              }
            }*/
            });
          }
        else {
          console.log('The location is too far' + body.rows[0].elements[0].duration.value);
          res = false;
          callback(null, res);
        }
      });
     },


     findNearbyPlaces : function(coordinates, radius, callback) {
	  //Find nearby places
	  //UTF-8 encoded for: ផ្សារ|វត្ត|សាលាសង្កាត់|ក្រសួង|សាកលវិទ្យាល័យ|មន្ទីរពេទ្យ|សាលា|ឱសថស្ថាន|ឧទ្យាន,បុរី|ស្ថានីយប្រេង|ព្រឹទ្ធសភា|ខេត្ត|សាខាពន្ធដារខណ្ឌ
     	request({
	      url: 'https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=' + coordinates.lat + ',' + coordinates.long + '&radius=' + radius + '&keyword=%E1%9E%9F%E1%9E%B6%E1%9E%80%E1%9E%9B%E1%9E%9C%E1%9E%B7%E1%9E%91%E1%9F%92%E1%9E%99%E1%9E%B6%E1%9E%9B%E1%9F%90%E1%9E%99|%E1%9E%80%E1%9F%92%E1%9E%9A%E1%9E%9F%E1%9E%BD%E1%9E%84|%E1%9E%98%E1%9E%93%E1%9F%92%E1%9E%91%E1%9E%B8%E1%9E%9A%E1%9E%96%E1%9F%81%E1%9E%91%E1%9F%92%E1%9E%99|%E1%9E%9C%E1%9E%8F%E1%9F%92%E1%9E%8F|%E1%9E%95%E1%9F%92%E1%9E%9F%E1%9E%B6%E1%9E%9A|%E1%9E%9F%E1%9E%B6%E1%9E%9B%E1%9E%B6%E1%9E%9F%E1%9E%84%E1%9F%92%E1%9E%80%E1%9E%B6%E1%9E%8F%E1%9F%8B|%E1%9E%94%E1%9E%BB%E1%9E%9A%E1%9E%B8|%E1%9E%9F%E1%9E%B6%E1%9E%81%E1%9E%B6%E1%9E%96%E1%9E%93%E1%9F%92%E1%9E%92%E1%9E%8A%E1%9E%B6%E1%9E%9A%E1%9E%81%E1%9E%8E%E1%9F%92%E1%9E%8C|%E1%9E%B1%E1%9E%9F%E1%9E%90%E1%9E%9F%E1%9F%92%E1%9E%90%E1%9E%B6%E1%9E%93|%E1%9E%9F%E1%9E%B6%E1%9E%9B%E1%9E%B6|%E1%9E%9F%E1%9F%92%E1%9E%90%E1%9E%B6%E1%9E%93%E1%9E%B8%E1%9E%99%E1%9E%94%E1%9F%92%E1%9E%9A%E1%9F%81%E1%9E%84&key=' + process.env.GoogleApiKey,
	      json: true
	    }, function (error, response, body) {
	      console.log('NearBy search with radius ' + radius + ' meters: ' + JSON.stringify(body, null, 2));
	      if (error) {
	        console.log('Google Nearby Places request error: ' + error);
	        err = 'Oops there was a problem, let\'s try again';
	        callback(err, null);
	      }
	      else {
	        //Check if there are 0, 1 or 2 nearby places
	        if(body.status === 'ZERO_RESULTS') {
	        	landmark1 = null; 
	        	landmark2 = null;
	        	myQuestion = 'do you live in ' + sangkat + '?';
	        	res = [landmark1, landmark2, myQuestion];
	        	callback(null, res);
	        }
	        else if(body.results[1]) {
	        	landmark1 = body.results[0].name; 
	        	landmark2 = body.results[1].name; 
	        	myQuestion = 'do you live in ' + sangkat + ', around ' + landmark1 + ' and ' + landmark2 + '?';
	        	res = [landmark1, landmark2, myQuestion];
	        	callback(null, res);
	        }
	        else if(body.results[0]) {
	        	landmark1 = body.results[0].name; 
	        	landmark2 = null;
	        	myQuestion = 'do you live in ' + sangkat + ', around ' + landmark1 + '?';
	        	res = [landmark1, landmark2, myQuestion];
	        	callback(null, res);
	        }
		   }
		});
     },


     findStreetView : function(coordinates, callback) {
     	panoramaByLocation([coordinates.lat, coordinates.long], {radius: 1200}, (err, result) => {
     		if (err) {
     			var res = false;
		      console.log('Panorama by location error: ' + err);
		      callback(null, res);
		    }
		    else {
		      var streetViewLat = result.latitude;
		      var streetViewLong = result.longitude;
		      //*******//
		      var distanceMatrixRequest = 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=' + coordinates.lat + ',' + coordinates.long + '&destinations=' + streetViewLat + ',' + streetViewLong + '&mode=walking&units=metric&key=' + process.env.GoogleApiKey;
		      // Below code check the distance and walking time from received coordinates to the found pano
		      request({
		        url: distanceMatrixRequest,
		        json: true
		      }, function (error, response, body) {
		        if(error || body.status !== 'OK') {
		          console.log('Distancematrix request error: ' + error);
		          console.log('Distance matrix body: ' + JSON.stringify(body, null, 2));
		          console.log('Distance matrix body: ' + JSON.stringify(response, null, 2));
		          err = 'there was a problem 🤔 let\'s try again';
		          callback(err, null);
		        } 
		        else {
		          var streetViewUrl = 'https://maps.googleapis.com/maps/api/streetview?size=640x640&location=' + streetViewLat + ',' + streetViewLong + '&heading=0&fov=100&pitch=10&key=' + process.env.GoogleApiKey;
		          var streetViewUrl2 = 'https://maps.googleapis.com/maps/api/streetview?size=640x640&location=' + streetViewLat + ',' + streetViewLong + '&heading=100&fov=100&pitch=10&key=' + process.env.GoogleApiKey;
		          var distance = Math.round(body.rows[0].elements[0].distance.value / 50) * 50; // rounded to 50m
		          var walk = Math.ceil(body.rows[0].elements[0].duration.value / 60); // rounded to the minute
		          var streetViewCoordinates = [streetViewLat, streetViewLong];
		          res = [distance, walk, streetViewUrl, streetViewUrl2, streetViewCoordinates];
		          console.log('distance matrix body: ' + body);
		          console.log('Original URL: ' + streetViewUrl);
		          console.log('Streetview image URL: ' + streetViewUrl2);
		          console.log('Distance between both: ' + body.rows[0].elements[0].distance.value);
		          callback(null, res);
		      }
		  	});
		  }
		});
     },


     findStreetView2 : function(coordinates, latLongAdjusted, callback) {
     	panoramaByLocation(latLongAdjusted, {radius: 100}, (err, result) => {
	      var streetViewLat2 = result.latitude;
	      var streetViewLong2 = result.longitude;
	      var distanceMatrixRequest = 'https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=' + coordinates.lat + ',' + coordinates.long + '&destinations=' + streetViewLat2 + ',' + streetViewLong2 + '&mode=walking&units=metric&key=' + process.env.GoogleApiKey;
	      var streetViewUrlAdjusted = 'https://maps.googleapis.com/maps/api/streetview?size=640x640&location=' + streetViewLat2 + ',' + streetViewLong2 + '&heading=180&fov=100&pitch=10&key=' + process.env.GoogleApiKey;
	      var streetViewUrlAdjusted2 = 'https://maps.googleapis.com/maps/api/streetview?size=640x640&location=' + streetViewLat2 + ',' + streetViewLong2 + '&heading=240&fov=100&pitch=10&key=' + process.env.GoogleApiKey;
	      request({
	      url: distanceMatrixRequest,
	      json: true
	    }, function (error, response, body) {
	      if (error || body.status !== 'OK') {
	        console.log("DISTANCE MATRIX REQUEST ERROR");
	        err = 'there was a problem 🤔 let\'s try again';
	        callback(err, null);
	      } 
	      else {
	        console.log("STATUS OK");
	        var distance2 = Math.round(body.rows[0].elements[0].distance.value / 50) * 50;
	        var walk2 = Math.ceil(body.rows[0].elements[0].duration.value / 60);
	        res = [distance2, walk2, streetViewUrlAdjusted, streetViewUrlAdjusted2];
	        callback(null, res);
	    }
	});
  });
 }
};