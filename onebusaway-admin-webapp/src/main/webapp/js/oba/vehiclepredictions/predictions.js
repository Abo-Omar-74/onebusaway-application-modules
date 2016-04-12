/**
 * Copyright (c) 2016 Cambridge Systematics, Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

var maps = [];
var domain="prod.wmata.obaweb.org";
var port=8080;
var avlAttrs = new Object();
var obaAttrs = new Object();

jQuery(function() {
	startup();
});

function refresh() {
	displayAttrs("#avlData", avlAttrs);
	displayAttrs("#obaData", obaAttrs);
}
function startup() {
	
	// stuff to do on load
	jQuery("#display_vehicle").click(onSearchClick);
}

function loadMap(latLng, mapName) {
	var map;
	if (maps[mapName] != undefined) {
		map = maps[mapName];
	} else {
		map = L.map(mapName);
		maps[mapName] = map;
		L.control.scale({metric: false}).addTo(map);
		L.tileLayer('http://api.tiles.mapbox.com/v4/transitime.j1g5bb0j/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoidHJhbnNpdGltZSIsImEiOiJiYnNWMnBvIn0.5qdbXMUT1-d90cv1PAIWOQ', {
			attribution: '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> &amp; <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
			maxZoom: 19
		}).addTo(map);
	}

	// center map around marker
	map.setView(latLng, 17);
	var marker = L.marker(latLng).addTo(map);
	
}

function loadAvlMap(latLng) {
	if (latLng != null) {
		loadMap(latLng, 'avlMap');
	}
}
function loadObaMap(latLng) {
	if (latLng != null) {
		loadMap(latLng, 'obaMap');
	}
}


function onSearchClick() {
	setTimeout(refresh, 5000); // this is a hack for async calls below
	setTimeout(refresh, 10000);
	jQuery("#maps").show();
	var vehicleId = jQuery("#vehicleId").val();
	var agencyId="1";
	var now = new Date();
	var oneMinuteAgo = new Date(now.getTime() - (1 * 60 * 1000));
	var beginDate=formatDate(oneMinuteAgo);
	var numDays=1;
	var beginTime=formatTime(oneMinuteAgo);
	var avlUrl= "http://gtfsrt." + domain + ":" + port + "/web/reports/avlJsonData.jsp?a="
	+ agencyId + "&beginDate=" + beginDate + "&numDays=" + numDays + "&v=" + vehicleId + 
	"&beginTime=" + encodeURI(beginTime);
	jQuery.ajax({
		url: avlUrl,
		type: "GET",
		async: false,
		success: function(response) {
			var attrs = parseAvlData(response);
			loadAvlMap(attrs['latLng']);
			queryPredictionValues(attrs, vehicleId);
			displayAttrs("#avlData", attrs);
			avlAttrs = attrs;
		}
	});
	//http://app.prod.wmata.obaweb.org/onebusaway-api-webapp/siri/vehicle-monitoring?key=OBAKEY&callback=jsonp1460454759616&_=1460454774864&OperatorRef=1&LineRef=5A&type=json
	var obaUrl = "http://app." + domain + "/onebusaway-api-webapp/siri/vehicle-monitoring?key=OBAKEY&OperatorRef="
	+ agencyId + "&VehicleRef=" + vehicleId +  "&type=json";
	jQuery.ajax({
		url: obaUrl,
		jsonp: "callback",
		dataType: "jsonp",
		type: "GET",
		async: false,
		success: function(response) {
			var attrs = parseSiri(response)
			loadObaMap(attrs['latLng']);
			queryOBAApiValues(attrs, agencyId, vehicleId);
			displayAttrs("#obaData", attrs);
			obaAttrs = attrs;
		}
	});

}

function queryOBAApiValues(attrs, agencyId, vehicleId) {
	//http://app.prod.wmata.obaweb.org/onebusaway-api-webapp/api/where/trip-for-vehicle/1_7181.json?key=OBAKEY
	var apiUrl = "http://app." + domain 
	+ "/onebusaway-api-webapp/api/where/trip-for-vehicle/"
	+ agencyId + "_" + vehicleId + ".json?key=OBAKEY";
	jQuery.ajax({
		url: apiUrl,
		type: "GET",
		jsonp: "callback",
		dataType: "jsonp",
		async: false,
		success: function(response) {
			attrs["obaapicall"] = "false";
			var now = new Date(response.currentTime);
			if (response.data != undefined && response.data.entry != undefined 
					&& response.data.entry.status != undefined) {
				var e = response.data.entry;
				var s = e.status;
				attrs["schedDev"] = s.scheduleDeviation;
				attrs["tdsNextStopId"] = s.nextStop.split("_")[1];
				attrs["tdsNextPrediction"] = new Date(now + s.nextStopTimeOffset * 1000);
				attrs["obaapicall"] = "true";
			}
		}
	});
	
}

function queryPredictionValues(attrs, vehicleId) {
	var vehicleDetailsUrl = "http://gtfsrt." + domain + ":" + port 
	+ "/api/v1/key/4b248c1b/agency/1/command/vehiclesDetails?v=" 
	+ vehicleId + "&format=json";
	jQuery.ajax({
		url: vehicleDetailsUrl,
		type: "GET",
		async: false,
		success: function(response) {
			var v = response.vehicles[0];
			attrs["routeId"] = v.routeId;
			attrs["schedDev"] = v.schAdhStr;
			attrs["blockAlpha"] = v.block;
			attrs["tripId"] = v.trip;
			attrs["nextStopId"] = v.nextStopId;
		}
	});
	
	if (attrs["routeId"] != undefined && attrs["nextStopId"] != undefined) {
	
		var predictionUrl = "http://gtfsrt." + domain + ":" + port 
		+ "/api/v1/key/4b248c1b/agency/1/command/predictions?rs=" 
		+ attrs["routeId"] + "|" + attrs["nextStopId"] 
		+ "&numPreds=20&format=json";
		jQuery.ajax({
			url: predictionUrl,
			type: "GET",
			async: false,
			success: function(response) {
				jQuery.each(response.predictions, function( pindex, pvalue){
					jQuery.each(pvalue.dest, function( dindex, dvalue){
						jQuery.each(dvalue.pred, function( predindex, predvalue){
							if (predvalue.vehicle == vehicleId) {
								attrs["nextPrediction"] = new Date(predvalue.time * 1000);
								return;
							} else {
								console.log("skipping vehicle=" + predvalue.vehicle);
							}
						});
					});
				});
			}
		});
	} else {
		console.log("vehicleDetails did not return route/stop, returning")
	}

}


function parseSiri(siri) {
	var attrs = new Object();
	var latLng = null;
	var sd = siri.Siri.ServiceDelivery;
	if (sd != undefined) {
		var vmd = sd.VehicleMonitoringDelivery;
		var va = vmd[0].VehicleActivity;
		if (va != undefined && va.length > 0) {
			var mvj = va[0].MonitoredVehicleJourney;
			if (mvj != undefined) {
				latLng = L.latLng(mvj.VehicleLocation.Latitude, mvj.VehicleLocation.Longitude);
				attrs['pretty_timestamp'] = new Date(sd.ResponseTimestamp);
				attrs["latLng"] = latLng
				attrs["routeId"] = mvj.LineRef.split("_")[1];
				attrs["tripId"] = mvj.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split("_")[1];
				attrs["siriNextStopId"] = mvj.MonitoredCall.StopPointRef.split("_")[1];
				attrs["siriNextPrediction"] = mvj.MonitoredCall.ExpectedArrivalTime;
				attrs["siriMonitored"] = mvj.Monitored;
			} else {
				console.log("MonitoringVehicleJourney missing");
			}
		} else {
			console.log("VehiceActivity missing:" + siri.Siri.ServiceDelivery.VehicleMonitoringDelivery);
		}
	}
	return attrs;
}

function formatDate(date) {
	var local = new Date(date);
    local.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return local.toJSON().slice(0, 10);
}

function formatTime(date) {
	var local = new Date(date);
    local.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return local.toJSON().slice(11, 19);
	
}

function parseAvlData(jsonData) {
	var attrs = new Object();
	// For each AVL report...
    var vehicle;
    
    if (jsonData.data.length == 0) {
    	console.log("no data: " + jsonData);
    }
    
    for (var i=0; i<jsonData.data.length; ++i) {
    	var avl = jsonData.data[i];
		
    	// parse date string -> number
    	avl.timestamp = Date.parse(avl.time.replace(/-/g, '/').slice(0,-2))
  	    attrs['timestamp'] = avl.timestamp;
    	attrs['pretty_timestamp'] = new Date(avl.timestamp);
		// we only want the most recent
		latLng = L.latLng(avl.lat, avl.lon);
    	attrs['latLng'] = latLng;
    }
    return attrs;
}



function displayAttrs(divName, attrs) {
	var html = "";
	var div = jQuery(divName);
	jQuery.each(attrs, function( index, value ) {
		html = html + "<p>" + lookupTitle(index) + ":&nbsp" + value + "</p>";
	});
	div.html(html);
	
}


function lookupTitle(s) {
	var txt;
    switch (s) {
    	case "timetamp":
    		txt = "Raw Timestamp";
    		break;
    	case "pretty_timestamp":
  		  txt = "Timestamp";
  		  break;
    	case "latLng":
    		txt = "Lat/Lon";
    		break;
	    default:
	      txt = s;
  }
  return "<b>" + txt + "</b> ";
}
