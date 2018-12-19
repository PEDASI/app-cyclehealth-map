/*jshint esversion: 6 */
/*jshint esversion: 6 */

"use strict";

// PEDASI convenience set up
const PEDASI_API = 'https://dev.iotobservatory.io';
const DATASET_CYCLEROUTE_HC = '/api/datasources/4/data/';
const DATASET_CYCLEROUTE_EN = '/api/datasources/3/datasets/';
const DATASET_CLEANSPACE = '/api/datasources/5/data/';

// Default client_id and key: for testing only!
const CS_AUTH = "?clientId=CLIENT_ID&key=YOUR_KEY";

const MAX_AQI = 60.0;
const MAX_WAYPOINTS = 200;

let map;

/**
 * Initialise a new Leaflet.js map focused on the UK.
 * @returns {Map} map The leaflet map instance.
 */
function initialise_map() {
    // Create our map and set the initial view to the UK
    let mapOptions = {center: [17.385044, 78.486671], zoom: 10};
    let map = new L.map('map', mapOptions);
    let uk_bbox = [[49.82380908513249, -10.8544921875], [59.478568831926395, 2.021484375]];
    map.fitBounds(uk_bbox);

    // Add new TileLayer specifying the interface format to OpenStreetMap
    let layer = new L.TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    map.addLayer(layer);

    return map;
}

/**
 * Return a colour based on value of air quality index, from green (good) to crimson (bad).
 * @param {Number} aqi Value from 0-MAX_AQI indicating route average air quality
 * @return {String} color_name Name of the colour assigned based on given index
 */
function get_color_from_aqi(aqi) {
    let color_name = 'black';
    switch (true) {
        case (aqi < 5):
            color_name = 'green';
            break;
        case (aqi < 10):
            color_name = 'yellow';
            break;
        case (aqi < 15):
            color_name = 'orange';
            break;
        case (aqi < 20):
            color_name = 'red';
            break;
        case (aqi < 30):
            color_name = 'purple';
            break;
        default:
            color_name = 'crimson';
            break;
    }

    return color_name;
}

/**
 * Create a progressbar.js widget set to given air quality index number
 * @param {Number} avg_aqi Value from 0-MAX_AQI indicating route average air quality
 */
function create_avg_aqi_index(avg_aqi) {
    $('#aqi-circular').empty();

    let bar_color = get_color_from_aqi(avg_aqi);
    let aqi_widget = new ProgressBar.Circle('#aqi-circular', {
        easing: 'easeInOut',
        duration: 2000,
        strokeWidth: 8,
        trailWidth: 2,
        from: {color: '#AA0000'},
        to: {color: '#00AA00'},
        color: bar_color,
        text: {
            style: {
                color: '#000000',
                position: 'relative',
                top: '30%',
                transform: {
                    prefix: true,
                    value: 'translate(0%, -192%)'
                },
                'text-align': 'center',
                'font-size': '28px',
                'font-weight': 'bold'
            }
        }
    });

    // Set widget text to value with 2 significant digits
    aqi_widget.setText(Math.round(avg_aqi * 10) / 10);

    // Set and animate the circular bar as a proportion of index magnitude and maximum value
    aqi_widget.animate((MAX_AQI - Math.min(avg_aqi, MAX_AQI)) / MAX_AQI);
}

/**
 * Add per-waypoint air quality data to route overview table.
 * @param {Array} leaflet_wps Array of Leaflet lat/lng waypoints and CleanSpace air quality data
 */
function add_aqi_route_overview(leaflet_wps) {
    // Add rows of air quality data to our route health overview table, with
    // consecutive duplicate rows collapsed into single rows for brevity
    let last_wp = null;
    let last_wp_info = null;
    for(let wp_num = 0; wp_num < leaflet_wps.length; wp_num++) {
        let wp = leaflet_wps[wp_num];

        // Extract the air quality data into an HTML-ised string
        let cs_level = wp[1].index + ' ' + wp[1].level;
        let cs_majpol = wp[1].major_pollutant.pollutant + '<br>' + wp[1].major_pollutant.description;
        let cs_recs = wp[1].recommendations;
        let new_wp_info = '<td>' + cs_level + '</td><td>' + cs_majpol + '</td><td>' + cs_recs + '</td></tr>';

        if (wp_num === 0) {
            // This is the first run through, so set the last known air quality data to this waypoint
            last_wp = wp_num;
            last_wp_info = new_wp_info;
        } else if (new_wp_info !== last_wp_info || wp_num === leaflet_wps.length-1) {
            // When we encounter a waypoint with different air quality data, add the previous
            // captured data to our table
            // Also add it if this is the last row in the waypoint array, otherwise it won't be added
            let wp_ref = (wp_num === leaflet_wps.length-1) ? wp_num +1: wp_num;
            let new_index = null;
            if (wp_num == (last_wp + 1)) {
                // There is only one row that contains this data, don't add a range
                new_index = '<tr><td>' + (wp_ref) + '</td>';
            } else {
                // There are more than one row with the same data, add it as a range
                new_index = '<tr><td>' + (last_wp+1) + '-' + (wp_ref) + '</td>';
            }
            $('#waypoint-data-table').append(new_index + last_wp_info);

            // Record this waypoint air quality data so we can compare with others later
            last_wp = wp_num;
            last_wp_info = new_wp_info;
        }
    }
}

/**
 * Add complete route to our map, with color of line between waypoints indicating overall air quality.
 * @param {Array} leaflet_wps Array of Leaflet lat/lng waypoints and CleanSpace air quality data
 * @param {FeatureGroup} l_group The Leaflet feature group to which we add our markers
 */
function add_route_to_map(leaflet_wps, l_group) {
    // Populate the Leaflet feature group with colour-coded route polylines between each waypoint
    for(let wp_num = 1; wp_num < leaflet_wps.length; wp_num++) {
        let wp = leaflet_wps[wp_num];
        let wp_p = leaflet_wps[wp_num-1];

        let cs_aqi = wp[1].index;
        let l_color = get_color_from_aqi(cs_aqi);
        let l_polyline = L.polyline([wp_p[0], wp[0]], { color: l_color, weight: 2, dashArray: '5,4', lineJoin: 'round' });

        // Add polyline to a feature group, to make it easier to find boundary of interest
        l_group.addLayer(l_polyline);
    }
}

/**
 * Add waypoint markers to the map, each with popup info boxes of pollutants at that waypoint.
 * @param {Array} leaflet_wps Array of Leaflet lat/lng waypoints and CleanSpace air quality data
 * @param {FeatureGroup} l_group The Leaflet feature group to which we add our markers
 */
function add_waypoint_popups(leaflet_wps, l_group) {
    // Add green start and red end markers for the route to our feature group
    // Do this first so that they don't occlude the hover popups for these (added next),
    // and will react to mouse events to show the popups
    l_group.addLayer(L.circle(leaflet_wps[0][0], {color: 'green', weight: 1, fill: 'false', fillOpacity: 0.75, radius: 20}));
    l_group.addLayer(L.circle(leaflet_wps[leaflet_wps.length - 1][0], {color: 'red', fillColor: 'red', fillOpacity: 0.75, radius: 20}));

    // Add detailed air quality data as mouse hover popups for each waypoint to our feature group
    for(let wp_num = 0; wp_num < leaflet_wps.length; wp_num++) {
        let wp = leaflet_wps[wp_num];

        // Add a new waypoint circular marker which pops up an info box with waypoint pollutant data
        // when mouse hovers over it
        let l_circle = L.circle(wp[0], {color: 'black', weight: 2, opacity: 0.5, fillOpacity: 0.0, fill: 'false', radius: 15});
        let aq_str = '<p><b>Waypoint ' + (wp_num+1) + '</b><br><b>AQI: ' + wp[1].index + '</b></p><p>';
        for(let pol in wp[1].pollutant) {
            aq_str += '<b>' + pol + ':</b> ' + wp[1].pollutant[pol] + '<br>';
        }
        aq_str += '</p>';
        l_circle.bindTooltip(aq_str, {offset: [20, 0], sticky: true, direction: 'right'});
        l_group.addLayer(l_circle);
    }
}

/**
 * Generate an air quality report for a given route.
 * @param {Array} results Array of results from CISCO's cycle route data
 * @param {Map} map The leaflet map instance
 * @param {String} map The API key to authenticate with PEDASI
 */
async function generate_route_report(waypoints, map, pedasi_app_api_key) {
    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Delete contents of waypoint overview data from any previous runs and show progress bar
    $('#waypoint-data-table > tr').remove();
    $('#progress-dialogue').modal('show');

    // Ask CleanSpace for air quality data for each waypoint, adding it to an array
    let promises = [];
    let leaflet_wps = [];
    for(let wp_num = 0; (wp_num < waypoints.length) && (wp_num < MAX_WAYPOINTS); wp_num++) {
        let waypoint = waypoints[wp_num];

        let cleanspace_query_url = PEDASI_API + DATASET_CLEANSPACE + CS_AUTH + "&lng=" + waypoint[0] + "&lat=" + waypoint[1];
        promises.push($.ajax({
            url: cleanspace_query_url,
            type: "GET",
            headers: { 'Authorization': 'Token ' + pedasi_app_api_key },
            success: function(response) {
                leaflet_wps.push([L.latLng(waypoint[1], waypoint[0]), response.aqi]);
            }, error: function(jq_xhr, exception) {
                console.log("Error: " + jq_xhr, exception);
            }
        }));

        let percent = Math.round(((wp_num+1) / waypoints.length) * 100);
        $('#processing-route-bar').css('width', percent + '%').attr('aria-valuenow', percent);

        // Reduce rate of CleanSpace API requests
        await sleep(200);
    }

    // Convenience function to ignore raised errors from promises, since we only care
    // about valid results and by default Promises.all() will not complete with >0 errors
    function ignore(promise) {
        return promise.catch(e => undefined);
    }

    // Wait until all our promise requests are finished (either failed or successful)
    await Promise.all(promises.map(ignore));

    // Calculate average air quality index for route
    let avg_aqi = leaflet_wps.reduce(function (sum, wp) {
        return sum + parseFloat(wp[1].index);
    }, 0) / leaflet_wps.length;

    // Create/replace average air quality index widget with calculated average
    create_avg_aqi_index(avg_aqi);

    // Create a Leaflet feature group on our map which contains the route and air quality markers,
    // then add the route and the waypoint markers to it
    let l_group = L.featureGroup().addTo(map);
    add_route_to_map(leaflet_wps, l_group);
    add_waypoint_popups(leaflet_wps, l_group);

    // Add summary route report
    add_aqi_route_overview(leaflet_wps);

    // Determine the boundary for our polyline and markers, and restrict map view accordingly
    map.fitBounds(l_group.getBounds());

    // Make average air quality index and summary route report visible, and hide progress bar
    $('#waypoint-report').removeClass('d-none');
    $('#progress-dialogue').modal('hide');
}

/**
 * Convert a GPX 1.1 route into an array of waypoints.
 * @param {String} gpx_route GPX 1.1 XML document string of route data
 * @return {Array} waypoints Array of lat/lng coordinates
 */
function convert_gpx(gpx_route) {
    // Extract list of route data embedded in XML document
    let xml_doc = $.parseXML(gpx_route);
    let xml = $(xml_doc);
    let segment = xml.find('trkseg');
    let wp_list = segment[0].getElementsByTagName('trkpt');

    // Add each route point to an array of waypoints
    let waypoints = [];
    for(let wp_num = 0; wp_num < wp_list.length; wp_num++) {
        let wp = wp_list[wp_num];
        let lng = parseFloat(wp.getAttribute('lon'));
        let lat = parseFloat(wp.getAttribute('lat'));

        waypoints.push([parseFloat(lng), parseFloat(lat)]);
    }

    return waypoints;
}

/**
 * Convert a GPX 1.1 route into an array of waypoints.
 * @param {String} gpx_route XML string of GPX 1.1 route
 * @return {Array} waypoints Array of lat/lng coordinates
 */
function simplify_waypoints(waypoints) {
    // Need to convert to Leaflet points (type used by simplify())
    let l_points = waypoints.map((wp, i, arr) => {
        return L.point(wp[0], wp[1]);
    });

    let simplified_points = L.LineUtil.simplify(l_points, 0.0002);

    // Convert back to our basic array of coordinates
    let new_waypoints = simplified_points.map((p, i, arr) => {
        return [p.x, p.y];
    });

    return new_waypoints;
}

/**
 * Generate route report from uploaded GPX file.
 */
function report_from_gpx() {
    let pedasi_app_api_key = $('#mapParamsAppKey').val();
    let file = $('#upload-gpx').prop('files')[0];
    if (!file) {
        return;
    }

    let reader = new FileReader();
    reader.onload = function(e) {
        let all_waypoints = convert_gpx(e.target.result);
        let waypoints = simplify_waypoints(all_waypoints);
        generate_route_report(waypoints, map, pedasi_app_api_key);
    }
    reader.readAsText(file);
}

/**
 * Reset uploaded file on form, and invoke the file selector dialogue for selecting a GPX file.
 * @returns {boolean} false Return false to ensure the page doesn't refresh on form submit.
 */
function select_gpx_file() {
    $('#upload-gpx').val('');
    $('#upload-gpx').trigger('click');

    return false;
}

/**
 * Update map and summary with selected route and air quality data for that route.
 * @returns {boolean} false Return false to ensure the page doesn't refresh on form submit.
 */
function report_from_staticroutes() {
    let cycle_route = $('#mapParamsCycleRoute').val();
    let pedasi_app_api_key = $('#mapParamsAppKey').val();

    // Request detailed CISCO route data for the selected route from PEDASI, using the provided
    // PEDASI Application or User API key required to authorise the request, then generate
    // air quality data for the route and add it all to the page
    let dataset_url = PEDASI_API + DATASET_CYCLEROUTE_EN;
    let ped_query_url = dataset_url + cycle_route + '/data';

    $.ajax({
        url: ped_query_url,
        type: "GET",
        headers: { 'Authorization': 'Token ' + pedasi_app_api_key },
        success: function(response) {
            let waypoints = response[0].loc.coordinates;
            generate_route_report(waypoints, map, pedasi_app_api_key);
        }
    });

    return false;
}

/**
 * Populate cycle route dropdown with cycle routes obtained from CISCO datasource.
 * @returns {boolean} false Return false to ensure the page doesn't refresh on form submit.
 */
function get_cycle_routes() {
    let pedasi_app_api_key = $('#mapParamsAppKey').val();

    // Request all CISCO cycle routes from PEDASI, using the provided PEDASI Application or User
    // API key required to authorise the request, then populate the cycle route dropdown
    let ped_query_url = PEDASI_API + DATASET_CYCLEROUTE_HC;
    $.ajax({
        url: ped_query_url,
        type: "GET",
        headers: { 'Authorization': 'Token ' + pedasi_app_api_key },
        success: function(response) {
            for(let item_num in response.items) {
                let route_href = response.items[item_num].href;
                let route_name = response.items[item_num]['item-metadata'][0].val;
                $('#mapParamsCycleRoute').append($('<option></option>').val(route_href).html(route_name));
            }
        }
    });

    return false;
}

/**
 * Initialise our global map on page load.
 */
function map_init() {
    map = initialise_map();
}
