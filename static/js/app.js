"use strict";

// PEDASI API endpoints
const PEDASI_API = 'https://dev.iotobservatory.io';           // Root PEDASI API endpoint
const DATASET_CYCLEROUTE_HC = '/api/datasources/4/data/';     // CISCO's cycleroute external HyperCat data source
const DATASET_CYCLEROUTE_EN = '/api/datasources/3/datasets/'; // CISCO's cycleroute external Entity API data source
const DATASET_CLEANSPACE = '/api/datasources/5/data/';        // CleanSpace's external data source

// Default client_id and key: for testing only!
const CS_AUTH = "?clientId=CLIENT_ID&key=YOUR_KEY";

// A working maximum Air Quality Index used to provide a quality percentage
const MAX_AQI = 60.0;
// Cycleroute waypoints over this number will not be processed
const MAX_WAYPOINTS = 200;

const AQI_METADATA_RANGES = [50, 100, 150];
const AQI_METADATA_RECS = [
    'Air quality is considered satisfactory, and poses no risk',
    'Air quality is acceptable; however, for some pollutants there may be a moderate health concern.',
    'Air quality is problematic; May experience health effects.',
    'Air quality is hazardous; may experience more serious health effects.'
];

const AQI_CIRCULAR_STYLE = {
    easing: 'easeInOut',
    duration: 2000,
    strokeWidth: 8,
    trailWidth: 2,
    from: {color: '#AA0000'},
    to: {color: '#00AA00'},
    color: {color: '#808080'}, // Default, to be overwritten
    text: {
        style: {
            color: '#000000',
            position: 'relative',
            top: '30%',
            transform: {
                prefix: true,
                value: 'translate(0%, -202%)'
            },
            'text-align': 'center',
            'font-size': '28px',
            'font-weight': 'bold'
        }
    }
};


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
 * Return a colour and recommendation based on value of air quality index,
 * from green (good) to crimson (bad).
 * @param {Number} aqi Value from 0-MAX_AQI indicating route average air quality
 * @return {[String, String]} color_name,rec Name of the colour assigned based on index, and string recommendation
 */
function get_color_recs_from_aqi(aqi, aqi_ranges) {
    let color_name;
    let rec;
    switch (true) {
        case (aqi < aqi_ranges[0]):
            color_name = 'lime';
            rec = AQI_METADATA_RECS[0];
            break;
        case (aqi < aqi_ranges[1]):
            color_name = 'yellow';
            rec = AQI_METADATA_RECS[1];
            break;
        case (aqi < aqi_ranges[2]):
            color_name = 'orange';
            rec = AQI_METADATA_RECS[2];
            break;
        default:
            // It's in the hazardous area
            color_name = 'lightcoral';
            rec = AQI_METADATA_RECS[3];
            break;
    }

    return [color_name, rec];
}

/**
 * Create a progressbar.js widget set to given air quality index number
 * @param {Number} avg_aqi Value from 0-MAX_AQI indicating route average air quality
 */
function create_aqi_index(avg_aqi, html_id, aqi_ranges) {
    $(html_id).empty();

    let bar_color = get_color_recs_from_aqi(avg_aqi, aqi_ranges)[0];

    let style = $.extend({}, AQI_CIRCULAR_STYLE);
    style.color = bar_color;

    let aqi_widget = new ProgressBar.Circle(html_id, style);

    // Set widget text to value with 2 significant digits
    aqi_widget.setText(Math.round(avg_aqi * 10) / 10);

    // Set and animate the circular bar as a proportion of index magnitude and maximum value
    aqi_widget.animate((MAX_AQI - Math.min(avg_aqi, MAX_AQI)) / MAX_AQI);
}

function create_range_slider() {

    var slider = document.getElementById('aqi-ranges');

    noUiSlider.create(slider, {
        range: {
            'min': 0,
            'max': 200
        },
        step: 5,
        start: AQI_METADATA_RANGES,
        margin: 5,
        limit: 600,
        connect: [true, true, true, true],
        direction: 'ltr',
        orientation: 'horizontal',
        behaviour: 'tap-drag',
        tooltips: true,
        format: wNumb({
            decimals: 0,
        }),
        pips: {
            mode: 'range',
            density: 4
        }
    });

    let connect = slider.querySelectorAll('.noUi-connect');
    let classes = ['good-color', 'acceptable-color', 'moderate-color', 'hazardous-color'];

    for (let i = 0; i < connect.length; i++) {
        connect[i].classList.add(classes[i]);
    }

}

/**
 * Add per-waypoint air quality data to route overview table.
 * @param {Array} leaflet_wps Array of Leaflet lat/lng waypoints and CleanSpace air quality data
 */
function add_aqi_route_overview(leaflet_wps, aqi_ranges) {
    // Add rows of air quality data to our route health overview table, with
    // consecutive duplicate rows collapsed into single rows for brevity
    let last_wp = null;
    let last_wp_info = null;
    for(let wp_num = 0; wp_num < leaflet_wps.length; wp_num++) {
        let wp = leaflet_wps[wp_num];

        // Extract the air quality data into an HTML-ised string
        let cs_level = wp[1].index;
        let color_recs = get_color_recs_from_aqi(cs_level, aqi_ranges);
        let cs_majpol = wp[1].major_pollutant.pollutant + '<br>' + wp[1].major_pollutant.description;
        let new_wp_info = '<td>' + cs_level + '</td><td>' + cs_majpol + '</td>' +
                          '<td style="mix-blend-mode: difference; color: black; background: ' + color_recs[0] + '">' + color_recs[1] + '</td></tr>';

        if (wp_num === 0) {
            // This is the first run through, so set the last known air quality data to this waypoint
            last_wp = wp_num;
            last_wp_info = new_wp_info;
        } else if (new_wp_info !== last_wp_info || wp_num === leaflet_wps.length-1) {
            // When we encounter a waypoint with different air quality data, add the previous
            // captured data to our table
            // Also add it if this is the last row in the waypoint array, otherwise it won't be added
            let wp_ref = (wp_num === leaflet_wps.length-1) ? wp_num +1: wp_num;
            let new_index;
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
function add_route_to_map(leaflet_wps, l_group, aqi_ranges) {
    // Populate the Leaflet feature group with colour-coded route polylines between each waypoint
    for(let wp_num = 1; wp_num < leaflet_wps.length; wp_num++) {
        let wp = leaflet_wps[wp_num];
        let wp_p = leaflet_wps[wp_num-1];

        let cs_aqi = wp[1].index;
        let color_recs = get_color_recs_from_aqi(cs_aqi, aqi_ranges);
        let l_polyline = L.polyline([wp_p[0], wp[0]], { color: color_recs[0], weight: 4, dashArray: '5,4', lineJoin: 'round' });

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
 * Set percentage of progress bar.
 * @param {Number} percent Percentage to set
 */
function set_progress_percentage(percent) {
    $('#processing-route-bar').css('width', percent + '%').attr('aria-valuenow', percent);
}

/**
 * Reset our progress bar and log.
 */
function reset_progress() {
    set_progress_percentage(0);
    $('#progress-text').empty();
}

/**
 * Add log text to progress log.
 * @param {String} log_str Log string to append to log text
 */
function add_to_progress_log(log_str) {
    $('<div />').text(log_str).appendTo('#progress-text');

    let height = $('#progress-text').get(0).scrollHeight;
    $('#progress-text').animate({ scrollTop: height }, 500);
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

    // Delete any previous map contents
    map.eachLayer(function(layer) {
        map.removeLayer(layer);
    });

    // Add new TileLayer specifying the interface format to OpenStreetMap
    let layer = new L.TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    map.addLayer(layer);

    // Delete contents of waypoint overview data from any previous runs and show progress bar
    $('#waypoint-data-table > tr').remove();

    add_to_progress_log('Initiating ' + waypoints.length + ' CleanSpace air quality requests via PEDASI...');

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
        set_progress_percentage(percent);

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

    // Calculate max air quality indexes for route
    let min_aqi = Math.min.apply(Math, leaflet_wps.map(function(w) { return w[1].index; }));
    let max_aqi = Math.max.apply(Math, leaflet_wps.map(function(w) { return w[1].index; }));

    // Grab AQI range settings from multi-range slider
    let aqi_ranges = document.getElementById('aqi-ranges').noUiSlider.get();

    console.log(aqi_ranges);


    // Create/replace average air quality index widget with calculated average
    create_aqi_index(avg_aqi, '#avg-aqi-circular', aqi_ranges);

    add_to_progress_log('Generating route map and air quality report...');

    // Create a Leaflet feature group on our map which contains the route and air quality markers,
    // then add the route and the waypoint markers to it
    let l_group = L.featureGroup().addTo(map);
    add_route_to_map(leaflet_wps, l_group, aqi_ranges);
    add_waypoint_popups(leaflet_wps, l_group);

    // Add summary route report
    add_aqi_route_overview(leaflet_wps, aqi_ranges);

    // Pause to ensure last log entries are visible before progress panel is closed
    await sleep(500);

    // Determine the boundary for our polyline and markers, and restrict map view accordingly
    map.fitBounds(l_group.getBounds());

    // Make average air quality index and summary route report visible
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
    reset_progress();
    $('#progress-dialogue').modal('show');

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
    reset_progress();
    $('#progress-dialogue').modal('show');

    let cycle_route = $('#mapParamsCycleRoute').val();
    let pedasi_app_api_key = $('#mapParamsAppKey').val();

    // Request detailed CISCO route data for the selected route from PEDASI, using the provided
    // PEDASI Application or User API key required to authorise the request, then generate
    // air quality data for the route and add it all to the page
    let dataset_url = PEDASI_API + DATASET_CYCLEROUTE_EN;
    let ped_query_url = dataset_url + cycle_route + '/data/';

    add_to_progress_log('Obtaining CISCO CityVerve cycle route via PEDASI...');
    $.ajax({
        url: ped_query_url,
        type: "GET",
        headers: { 'Authorization': 'Token ' + pedasi_app_api_key },
        success: function(response) {
            let waypoints = response[0].loc.coordinates;
            generate_route_report(waypoints, map, pedasi_app_api_key);
        }, error: function(jq_xhr, exception) {
            console.log("Error: " + jq_xhr, exception);
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
        }, error: function(jq_xhr, exception) {
            console.log("Error: " + jq_xhr, exception);
        }
    });

    return false;
}

/**
 * Initialise our global map on page load.
 */
function map_init() {
    map = initialise_map();
    create_range_slider();
}
