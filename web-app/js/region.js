/*
 *  Copyright (C) 2011 Atlas of Living Australia
 *  All Rights Reserved.
 *
 *  The contents of this file are subject to the Mozilla Public
 *  License Version 1.1 (the "License"); you may not use this file
 *  except in compliance with the License. You may obtain a copy of
 *  the License at http://www.mozilla.org/MPL/
 *
 *  Software distributed under the License is distributed on an "AS
 *  IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 *  implied. See the License for the specific language governing
 *  rights and limitations under the License.
 */

var region = {
    /**
     * Builds the query as a map that can be passed directly as data in an ajax call
     * @param regionType
     * @param regionName
     * @param regionFid
     * @param start [optional] start parameter for paging results
     * @returns {{q: *, pageSize: number}}
     */
    buildBiocacheQuery: function(regionType, regionName, regionFid, start) {
        var params = {q:region.buildRegionFacet(regionType, regionName, regionFid), pageSize: 50},
            timeFacet = region.buildTimeFacet();
        if (start) {
            params.start = start
        }

        if (timeFacet) {
            params.fq = timeFacet;
        }
        return params;
    },

    /**
     * Builds the query phrase for a range of dates - returns nothing for the default date range.
     */
    buildTimeFacet: function () {
        var fromPhrase = regionWidget.isDefaultFromYear() ? '*' : regionWidget.getCurrentState().from + "-01-01T00:00:00Z";
        var toPhrase = regionWidget.isDefaultToYear() ? "*" : regionWidget.getCurrentState().to + "-12-31T23:59:59Z";
        return "occurrence_year:[" + fromPhrase + " TO " + toPhrase + "]";
    },

    queryString: function () {
        if (!this.isInit()) { return "" }
        var fromPhrase = this.from() === this.defaultFrom ? '*' : this.from() + "-01-01T00:00:00Z",
            toPhrase = this.to() === this.defaultTo ? "*" : (this.to() - 1) + "-12-31T23:59:59Z";
        return "occurrence_year:[" + fromPhrase + " TO " + toPhrase + "]";
    },

    /**
     * Builds the query phrase for a region based on its type and name.
     */
    buildRegionFacet: function(regionType, regionName, regionFid) {
        if (regionType == 'layer') {
            return regionFid + ":[* TO *]";
        }
        else {
            return regionFid + ':"' + regionName + '"';
        }
    }
};

var RegionWidget = function (config) {

    var defaultFromYear = 1850;
    var defaultToYear = new Date().getFullYear();
    var defaultTab = 'speciesTab';
    var regionMap;
    var timeControls;

    /**
     * Essential values to maintain the state of the widget when the user interacts with it
     * @type {{regionName: null, regionType: null, regionFid: null, regionPid: null, regionLayerName: null, playState: null, group: null, subgroup: null, guid: null, from: null, to: null, tab: null}}
     */
    var state = {
        regionName: '',
        regionType: '',
        regionFid: '',
        regionPid: '',
        regionLayerName: '',
        playState: '',
        group: '',
        subgroup: '',
        guid: '',
        from: '',
        to: '',
        tab: ''
    };

    var urls = {};

    /**
     * Constructor
     * @param config
     */
    var init =  function(config) {
        state.regionName = config.regionName;
        state.regionType = config.regionType;
        state.regionFid = config.regionFid;
        state.regionPid = config.regionPid;
        state.regionLayerName = config.regionLayerName;

        state.group = state.group ? state.group : 'ALL_SPECIES';
        state.from = state.from ? state.from : defaultFromYear;
        state.to = state.to ? state.to : defaultToYear;
        state.tab = state.tab ? state.tab : defaultTab;

        urls = config.urls;

        // Initialize tabs
        $('#explorer a').click(function (e) {
            e.preventDefault();
            $(this).tab('show');
        });

        // Initialize Ajax activity indicators
        $(document).ajaxStart(
            function (e) {
                showTabSpinner();
            }).ajaxComplete(function () {
                hideTabSpinner();
            });

        // Initialize click events on individual species
        $(document).on('click', "#species tbody tr.link", function() {
            selectSpecies(this);
        });

        // Initialize info message
        $('#timeControlsInfo').popover();

        $('#viewRecords').click(function(event) {
            event.preventDefault();
            // check what group is active
            var url = urls.biocacheWebappUrl + '/occurrences/search?q=' +
                region.buildRegionFacet(state.regionType, state.regionName, state.regionFid) + "&fq=" + region.buildTimeFacet();
            if (state.group != 'ALL_SPECIES') {
                if (state.subgroup) {
                    url += '&fq=species_subgroup:' + state.subgroup;
                } else {
                    url += '&fq=species_group:' + state.group;
                }
            }
            document.location.href = url;
        });

        $('#downloadRecordsModal').modal({show: false});
    };


    /**
     * Updates state with new values and preserve state for when reloading page
     * @param newPartialState
     */
    var updateState = function(newPartialState) {
        $.extend(state, newPartialState);
        //TODO persist current state

    };

    /**
     * Function called when the user selects a species
     * @param row
     */
    var selectSpecies = function(row) {
        $("#species tbody tr.link").removeClass('speciesSelected')
        $("#species tbody tr.infoRowLinks").hide();
        var nextTr = $(row).next('tr');
        $(row).addClass('speciesSelected');
        $(nextTr).addClass('speciesSelected');
        $(row).next('tr').show();
        // Update state
        updateState({guid: $(row).attr('id')});
        regionMap.reloadRecordsOnMap();
    };

    /**
     * Hides the tab spinners
     * @param tabId
     */
    var hideTabSpinner = function (tabId) {
        if ($.active == 1) {
            if (tabId) {
                $('#' + tabId + ' i').addClass('hidden');
            } else {
                $('#' + state.tab + ' i').addClass('hidden');
            }
        }
    };

    /**
     * Shows the tab spinners
     * @param tabId
     */
    var showTabSpinner = function (tabId) {
        if (tabId) {
            $('#' + tabId + ' i').removeClass('hidden');
        } else {
            $('#' + state.tab + ' i').removeClass('hidden');
        }
    };

    /**
     * Code to execute when a group is selected
     */
    var selectGroup = function(group) {

        $('.group-row').removeClass('groupSelected');
        $("tr[parent]").hide();
        if (group != state.group) {
            $('#' + state.group + '-row i').removeClass('fa-chevron-down').addClass('fa-chevron-right');
        }
        var groupId = group.replace(/[^A-Za-z0-9\\d_]/g, "") + '-row';

        var isAlreadyExpanded = $('#' + groupId + ' i').hasClass('fa-chevron-down');
        if (isAlreadyExpanded) {
            $("tr[parent='" + groupId + "']").hide();
            $('#' + groupId + ' i').removeClass('fa-chevron-down').addClass('fa-chevron-right');
        } else {
            $("tr[parent='" + groupId + "']").show();
            $('#' + groupId + ' i').removeClass('fa-chevron-right').addClass('fa-chevron-down');
        }

        // Update widget state
        updateState({group: group, subgroup:'', guid: ''});
        // Mark as selected
        $('#' + groupId).addClass('groupSelected');

        // Last
        if (regionMap) {
            regionMap.reloadRecordsOnMap();
        }
        AjaxAnywhere.dynamicParams=state;
    };

    /**
     * Code to execute when a subgroup is selected
     * @param subgroup
     */
    var selectSubgroup = function(subgroup) {
        $('.group-row').removeClass('groupSelected');
        var subgroupId = subgroup.replace(/[^A-Za-z\\d_]/g, "") + '-row';

        //    var parent = $('#' + $('#' + subgroupId).attr('parent'));
        //    if (!$(parent).is(":visible")) {
        //        //TODO
        //    }

        // Update widget state
        updateState({subgroup: subgroup, guid: ''});
        // Mark as selected
        $('#' + subgroupId).addClass('groupSelected');

        // Last
        if (regionMap) {
            regionMap.reloadRecordsOnMap();
        }
        AjaxAnywhere.dynamicParams=state;
    }

    var _public = {

        isDefaultFromYear: function() {
            return state.from == defaultFromYear;
        },

        isDefaultToYear: function() {
            return state.to == defaultToYear;
        },

        getDefaultFromYear: function() {
            return defaultFromYear;
        },

        getDefaultToYear: function() {
            return defaultToYear;
        },

        getTimeControls: function() {
            return timeControls;
        },

        updateDateRange: function(from, to) {
            state.from = from;
            state.to = to;
            if (state.subgroup) {
                $('#' + state.subgroup + '-row').click();
            } else {
                $('#' + state.group + '-row').click();
            }
        },

        getUrls: function() {
            return urls;
        },

        getCurrentState: function() {
            return state;
        },

        groupsLoaded: function() {
            $('#groups').effect('highlight', 2000);
            selectGroup(state.group);
            this.loadSpecies();
        },

        selectGroupHandler: function(group, isSubgroup) {
            if (isSubgroup) {
                selectSubgroup(group);
            } else {
                selectGroup(group);
            }
        },

        loadSpecies: function() {
            $('#' + state.group + '-row').click();
        },

        speciesLoaded: function() {
            $('#species').effect('highlight', 2000);
        },

        showMoreSpecies: function() {
            $('#showMoreSpeciesButton').html("<i class='fa fa-cog fa-spin'></i>");
            AjaxAnywhere.dynamicParams=this.getCurrentState();
        },

        setMap: function(map) {
            regionMap = map;
        },

        setTimeControls: function(tc) {
            timeControls = tc
        }
    };

    init(config);
    return _public;
};

/**
 *
 * @param config
 * @returns {{}}
 * @constructor
 */
RegionTimeControls = function(config) {

    var timeSlider;
    var CONTROL_STATES = {
        PLAYING: 0,
        PAUSED: 1,
        STOPPED: 2
    };
    var state = CONTROL_STATES.STOPPED;
    var refreshInterval;
    var playTimeRange;

    var init = function(config) {
        timeSlider = $('#timeSlider')
            .slider({
                min: regionWidget.getDefaultFromYear(),
                max: regionWidget.getDefaultToYear(),
                range: true,
                values: [regionWidget.getCurrentState().from, regionWidget.getCurrentState().to],
                create: function() {
                    updateTimeRange($('#timeSlider').slider('values'));
                },
                slide: function( event, ui ) {
                    updateTimeRange(ui.values);
                },
                change: function( event, ui ) {
                    if (!(state === CONTROL_STATES.PLAYING)
                            || (ui.values[0] != ui.values[1] && ui.values[1] - ui.values[0] <= 10 )) {
                        regionWidget.updateDateRange(ui.values[0], ui.values[1]);
                    }
                    updateTimeRange(ui.values);
                }
            })

            .slider("pips", {
                rest: "pip",
                step: 10
            })
            .slider("float", {});

        initializeTimeControlsEvents();
    };

    var initializeTimeControlsEvents = function() {
        // Initialize play button
        $('#playButton').on('click', function(){
            play();
        });

        // Initialize stop button
        $('#stopButton').on('click', function(){
            stop();
        });

        // Initialize pause button
        $('#pauseButton').on('click', function(){
            pause();
        });

        // Initialize reset button
        $('#resetButton').on('click', function(){
            reset();
        });

        $('.timeControl').on('mouseover', function(){
            if (!$(this).hasClass('selected')) {
                var src = $(this).attr("src").match(/[-on]?[^\.]+/) + "-on.png";
                $(this).attr("src", src);
            }
        });

        $('.timeControl').on('mouseout', function(){
            if (!$(this).hasClass('selected')) {
                var src = $(this).attr("src").replace("-on.png", ".png");
                $(this).attr("src", src);
            }
        });

        $('.timeControl').on('selected', function(){
            if ($(this).hasClass('selected')) {
                var src = $(this).attr("src").replace(/(-on)?.png/, '-on.png');
                $(this).attr("src", src);

            } else {
                var src = $(this).attr("src").replace("-on.png", ".png");
                $(this).attr("src", src);
            }
        });
    }

    var increaseTimeRangeByADecade = function() {
        var incrementTo = (regionWidget.getDefaultToYear() - playTimeRange[1]) < 10 ? regionWidget.getDefaultToYear() - playTimeRange[1] : 10;
        if (incrementTo != 0) {
            $('#timeSlider').slider('values', [playTimeRange[0] + 10, playTimeRange[1] + incrementTo]);
            playTimeRange = $('#timeSlider').slider('values');
        } else {
            stop();
        }
    };

    var play = function() {

        switch (state) {
            case CONTROL_STATES.STOPPED:
                // Start playing from the beginning
                // Update state before updating slider values
                state = CONTROL_STATES.PLAYING;
                $('#timeSlider').slider('values', [regionWidget.getDefaultFromYear(), regionWidget.getDefaultFromYear() + 10]);
                break;
            case CONTROL_STATES.PAUSED:
                // Resume playing
                // Update state before updating slider values
                state = CONTROL_STATES.PLAYING;
                $('#timeSlider').slider('values', [playTimeRange[0], playTimeRange[1]]);
                break;
        }

        // For SVG elements the addClass and removeClass jQuery method do not work
        $('#pauseButton').removeClass('selected').trigger('selected');
        $('#playButton').addClass('selected').trigger('selected');
        playTimeRange = $('#timeSlider').slider('values');
        refreshInterval = setInterval(function () {
            increaseTimeRangeByADecade();
        }, 4000);
    };

    var stop = function() {
        clearInterval(refreshInterval);
        $('#pauseButton').removeClass('selected').trigger('selected');
        $('#playButton').removeClass('selected').trigger('selected');
        state = CONTROL_STATES.STOPPED;
    };

    var pause = function() {
        if (state === CONTROL_STATES.PLAYING) {
            $('#pauseButton').addClass('selected').trigger('selected');
            $('#playButton').removeClass('selected').trigger('selected');
            clearInterval(refreshInterval);
            state = CONTROL_STATES.PAUSED;
        }
    };

    var reset = function() {
        $('#timeSlider').slider('values', [regionWidget.getDefaultFromYear(), regionWidget.getDefaultToYear()]);
        stop();
        regionWidget.updateDateRange(regionWidget.getDefaultFromYear(), regionWidget.getDefaultToYear());
    };

    var updateTimeRange = function(values) {
        $('#timeFrom').text(values[0]);
        $('#timeTo').text(values[1]);
    };

    var _public = {

    };

    init(config);
    return _public;

}

/**
 *
 * @param config
 * @returns
 * @constructor
 */
var RegionMap = function (config) {

    var map;
    var overlays = [null,null];  // first is the region, second is the occurrence data
    var defaultOccurrenceOpacity = 0.7;
    var defaultRegionOpacity = 0.5;
    var initialBounds;
    var infoWindow;
    var useReflectService = true;
    var overlayFormat = "image/png";

    var init = function (config) {
        initialBounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(config.bbox.sw.lat, config.bbox.sw.lng),
            new google.maps.LatLng(config.bbox.ne.lat, config.bbox.ne.lng));

        useReflectService = config.useReflectService;

        var myOptions = {
            scrollwheel: false,
            streetViewControl: false,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
            },
            scaleControl: true,
            scaleControlOptions: {
                position: google.maps.ControlPosition.LEFT_BOTTOM
            },
            panControl: false,
            draggableCursor: 'crosshair',
            mapTypeId: google.maps.MapTypeId.TERRAIN  /*google.maps.MapTypeId.TERRAIN*/
        };

        map = new google.maps.Map(document.getElementById("region-map"), myOptions);
        map.fitBounds(initialBounds);
        map.enableKeyDragZoom();

        initializeOpcaityControls();

        /*****************************************\
         | Overlay the region shape
         \*****************************************/
        drawRegionOverlay();

        /*****************************************\
         | Overlay the occurrence data
         \*****************************************/
        drawRecordsOverlay();

        google.maps.event.addListener(map, 'click', function (event) {
            info(event.latLng);
        });

        /*******************************************************\
         | Hack the viewport if we don't have good bbox data
         \*******************************************************/
        // fall-back attempt at bounding box if all of Oz
        if (initialBounds.equals(new google.maps.LatLngBounds(
                new google.maps.LatLng(-42, 113),
                new google.maps.LatLng(-14, 153)))) {
            $.ajax({
                url: regionWidget.getUrls().proxyUrl + "?q=" + buildRegionFacet(regionType, regionName),
                //url: url,
                dataType: 'json',
                success: function (data) {
                    if (data[0] != 0.0) {
                        initialBounds = new google.maps.LatLngBounds(
                            new google.maps.LatLng(data[1], data[0]),
                            new google.maps.LatLng(data[3], data[2]));
                        map.fitBounds(initialBounds);
                        $('#using-bbox-hack').html("Using occurrence bounds")
                        $('#bbox').html("Using bbox " + newBbox.toString());
                    }
                }
            });
        }
    };

    /**
     * Set up opacity sliders
     */
    var initializeOpcaityControls = function() {

        $('#occurrencesOpacity').slider({
            min: 0,
            max: 100,
            value: defaultOccurrenceOpacity * 100,
            change: function (event, ui) {
                drawRecordsOverlay();
            }
        });
        $('#regionOpacity').slider({
            min: 0,
            max: 100,
            value: defaultRegionOpacity * 100,
            change: function (event, ui) {
                drawRegionOverlay();
            }
        });

        // Dixes accordion width
        $('#opacityControls').width( $('#opacityControls').width() + 2);

        $('#opacityControls a').on('click', function() {
            if ($('#opacityControlsContent').hasClass('in')) {
                $('#opacityControls i').switchClass('fa-chevron-down', 'fa-chevron-right');
            } else {
                $('#opacityControls i').switchClass('fa-chevron-right', 'fa-chevron-down');
            }
        });

        // layer toggling
        $("#toggleOccurrences").click(function () {
            toggleOverlay(1, this.checked);
        });
        $("#toggleRegion").click(function () {
            toggleOverlay(0, this.checked);
        });
    };

   /**
    * Called when the overlays are loaded. Not currently used
    * @param numtiles
    */
    var wmsTileLoaded = function(numtiles) {
        $('#maploading').fadeOut("slow");
    };

    /**
     * Turns the overlay layers on or off
     * @param n index of the overlay in the overlays list
     * @param show true to show; false to hide
     */
    var toggleOverlay = function(n, show) {
        map.overlayMapTypes.setAt(n, show ? overlays[n] : null);
    };

    /**
    * Returns the value of the opacity slider for the region overlay.
    */
    var getRegionOpacity = function() {
        var opacity = $('#regionOpacity').slider("value");
        return isNaN(opacity) ? defaultRegionOpacity : opacity / 100;
    };

    /**
     * Returns the value of the opacity slider for the occurrence overlay.
     */
    var getOccurrenceOpacity = function() {
        var opacity = $('#occurrencesOpacity').slider("value");
        return isNaN(opacity) ? defaultOccurrenceOpacity : opacity / 100;
    };

    /**
     * Load the region as a WMS overlay.
     */
    var drawRegionOverlay = function () {

        var currentState = regionWidget.getCurrentState();
        var urls = regionWidget.getUrls();

        if (currentState.regionType == 'layer') {
            /* this draws the region as a WMS layer */
            var layerParams = [
                "FORMAT=" + overlayFormat,
                "LAYERS=ALA:" + currentState.regionLayerName,
                "STYLES=polygon"
            ];
            overlays[0] = new WMSTileLayer(currentState.regionLayerName, urls.spatialCacheUrl, layerParams, wmsTileLoaded, getRegionOpacity());
            map.overlayMapTypes.setAt(0, overlays[0]);

        } else {
            var params = [
                "FORMAT=" + overlayFormat,
                "LAYERS=ALA:Objects",
                "viewparams=s:" + currentState.regionPid,
                "STYLES=polygon"
            ];
            overlays[0] = new WMSTileLayer(currentState.regionLayerName, urls.spatialWmsUrl, params, wmsTileLoaded, getRegionOpacity());
            map.overlayMapTypes.setAt(0, overlays[0]);
        }
    };

    /**
     * Load occurrence data as a wms overlay based on the current selection:
     * - if taxa box is visible, show the selected species group or species
     * - if taxonomy chart is selected, show the current named rank
     * - use date restriction specified by the time slider
     */
    var drawRecordsOverlay = function () {

        var currentState = regionWidget.getCurrentState();
        var urls = regionWidget.getUrls();

        if (useReflectService) {
            drawRecordsOverlay2();
            return;
        }

        var customParams = [
            "FORMAT=" + overlayFormat,
            "colourby=3368652",
            "symsize=4"
        ];

        //Add query string params to custom params
        var query = region.buildBiocacheQuery(currentState.regionType, currentState.regionName, currentState.regionFid,0, true);
        var searchParam = encodeURI("?q=" + query.q + "&fq=" + query.fq + "&fq=geospatial_kosher:true");

        var fqParam = "";
        if ($("#taxonomyTab").hasClass('active')) {
            // show records based on taxonomy chart
            if (taxonomyChart.rank && taxonomyChart.name) {
                fqParam = "&fq=" + taxonomyChart.rank + ":" + taxonomyChart.name;
            }
        }
        else {
            // show records based on taxa box
            if (currentState.guid) {
                fqParam = "&fq=taxon_concept_lsid:" + currentState.guid;
            }
            else if (currentState.group != "ALL_SPECIES") {
                if (currentState.subgroup) {
                    fqParam = "&fq=species_subgroup:" + currentState.subgroup;
                } else {
                    fqParam = "&fq=species_group:" + currentState.group;
                }
            }
        }

        searchParam += fqParam;

        var pairs = searchParam.substring(1).split('&');
        for (var j = 0; j < pairs.length; j++) {
            customParams.push(pairs[j]);
        }
        overlays[1] = new WMSTileLayer("Occurrences",
            urlConcat(urls.biocacheServiceUrl, "occurrences/wms?"), customParams, wmsTileLoaded, getOccurrenceOpacity());

        map.overlayMapTypes.setAt(1, $('#toggleOccurrences').is(':checked') ? overlays[1] : null);
    };

    var drawRecordsOverlay2 = function() {
        var currentState = regionWidget.getCurrentState();
        var urls = regionWidget.getUrls();

        var url = urls.biocacheWebappUrl + "/ws/webportal/wms/reflect?",
            query = region.buildBiocacheQuery(currentState.regionType, currentState.regionName, currentState.regionFid,0, true);
        var prms = [
            "FORMAT=" + overlayFormat,
            "LAYERS=ALA%3Aoccurrences",
            "STYLES=",
            "BGCOLOR=0xFFFFFF",
            'q=' + encodeURI(query.q),
            "fq=geospatial_kosher:true",
            'CQL_FILTER=',
            "symsize=3",
            "ENV=color:3366CC;name:circle;size:3;opacity:" + getOccurrenceOpacity(),
            //"ENV=color:22a467;name:circle;size:4;opacity:0.8",
            "EXCEPTIONS=application-vnd.ogc.se_inimage"
        ];

        if (query.fq) {
            prms.push("&fq=" + query.fq);
        }

        var fqParam = "";
        if ($("#taxonomyTab").hasClass('active')) {
            // show records based on taxonomy chart
            if (taxonomyChart.rank && taxonomyChart.name) {
                fqParam = "fq=" + taxonomyChart.rank + ":" + taxonomyChart.name;
            }
        }
        else {
            // show records based on taxa box
            if (currentState.guid) {
                fqParam = "fq=taxon_concept_lsid:" + currentState.guid;
            }
            else if (currentState.group != "ALL_SPECIES") {
                if (currentState.subgroup) {
                    fqParam = "&fq=species_subgroup:" + currentState.subgroup;
                } else {
                    fqParam = "&fq=species_group:" + currentState.group;
                }
            }
        }

        if (fqParam != "") {
            prms.push(fqParam);
        }

        overlays[1] = new WMSTileLayer("Occurrences (by reflect service)", url, prms, wmsTileLoaded, 0.8);

        map.overlayMapTypes.setAt(1, $('#toggleOccurrences').is(':checked') ? overlays[1] : null);
    };

    /**
     * Show information about the current layer at the specified location.
     * @param location
     */
    info = function(location) {
        var currentState = regionWidget.getCurrentState();
        var urls = regionWidget.getUrls();

        $.ajax({
            url: urls.proxyUrl + "?format=json&url=" + urls.spatialServiceUrl + "/intersect/" + currentState.regionFid + "/" +
            location.lat() + "/" + location.lng(),
            dataType: 'json',
            success: function(data) {
                if (data.length == 0) { return; }
                if (infoWindow) { infoWindow.close(); }

                var anyInfo = false;  // keep track of whether we actually add anything
                var desc = '<ol>';
                $.each(data, function(i, obj) {
                    if (obj.value) {
                        anyInfo = true;
                        var lyr = obj.layername == obj.value ? "" : " (" + obj.layername + ")";
                        desc += "<li>" + obj.value + lyr + "</li>";
                    }
                });
                desc += "</ol>";
                if (anyInfo) {
                    infoWindow = new google.maps.InfoWindow({
                        content: "<div style='font-size:90%;padding-right:15px;'>" + desc + "</div>",
                        position: location
                    });
                    infoWindow.open(map);
                }
            }
        });
    };

    var _public = {
        reloadRecordsOnMap: function () {
            drawRecordsOverlay();
        }
    };

    init(config);
    return _public;
};
