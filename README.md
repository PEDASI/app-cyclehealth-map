# PEDASI Cycle Route Health Example

## Introduction

This PEDASI example shows how a JavaScript application can make use of the following to build and draw
a cycling route map with a summary report of the health of that route:

* Two PEDASI external data sources:
  * CISCO CityVerve Portal: containing a fixed set of Manchester cycle path routes, with specific waypoint
data obtainable for each route.
  * CleanSpace: provides air quality data for a requested geolocation.
* Leaflet.js: a JavaScript visualisation library used to plot the IoT businesses for a location on a
zoomed map, using OpenStreetMap as the map plotting service.
* JQuery: a JavaScript library used to simplify HTML DOM tree traversal and manipulation, and handle
asynchronous Ajax calls to the PEDASI Applications API.
* Bootstrap 4: an open-source front-end framework for designing web applications.

## Prerequisites

The following are required to run the application:

* A web browser (e.g. Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge but not Microsoft
Internet Explorer).
* Either:
  * Access to the application hosted on GitHub gh-pages.
  * A local web server (e.g. for simple testing, you can use Python's internal test web server).
* A PEDASI Application or User API key, to authenticate with PEDASI to use its datasources.

## Running the Example Locally (Optional)

After cloning the repository, you can just do the following to host the application using Python 3's
basic built-in web server, e.g. on Linux/Mac OS:

```
$ python3 -m http.server
```

By default, this will run the web server on port 8000.

## Using the Application

Then using a web browser:

* If hosting the application locally on port 8000, go to http://localhost:8000.
* If accessing the application via GitHub's gh-pages, go to https://southampton-rsg.github.io/app-cyclehealth-map/.

You can then add your PEDASI Application or User API key, and select 'Get Routes'. The 'Cycle Route'
dropdown will then be populated with all cycle routes within CISCO's cycle path catalogue. Click submit
to get a breakdown on the map of the cycle route, along with air quality data for each route waypoint
obtained from CleanSpace. Hovering over a waypoint will show the extent of pollutants for that waypoint
in a popup.

## License
