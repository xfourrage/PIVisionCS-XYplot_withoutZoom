// <copyright file="PIVisualization.sym-xyplot.js" company="OSIsoft, LLC">
// Copyright © 2016-2018 OSIsoft, LLC. All rights reserved.
// THIS SOFTWARE CONTAINS CONFIDENTIAL INFORMATION AND TRADE SECRETS OF OSIsoft, LLC.
// USE, DISCLOSURE, OR REPRODUCTION IS PROHIBITED WITHOUT THE PRIOR EXPRESS WRITTEN
// PERMISSION OF OSIsoft, LLC.
//
// RESTRICTED RIGHTS LEGEND
// Use, duplication, or disclosure by the Government is subject to restrictions
// as set forth in subparagraph (c)(1)(ii) of the Rights in Technical Data and
// Computer Software clause at DFARS 252.227.7013
//
// OSIsoft, LLC.
// 1600 Alvarado Street, San Leandro, CA 94577
// </copyright>

/// <reference path="../_references.js" />

window.PIVisualization = window.PIVisualization || {};

(function (PV) {
    'use strict';

    function xyPlotVis() { }
    
    PV.deriveVisualizationFromBase(xyPlotVis);

    xyPlotVis.prototype.init = function (scope, element, $timeout, $sanitize, timeProvider, dateTimeFormatter, webServices, touchDetection, displayProvider, dataPump, log) {
        this.onDataUpdate = dataUpdate;
        this.onConfigChange = configChanged;
        this.onResize = resize;
        this.onDestory = destroy;
        this.labels = true;

        var runtimeData = scope.runtimeData;
        var suspendDuration = 300; // 5 minutes
        var elem = element;
        var chart;
        var timeRangeChanged = false;
        var pauseSymbolUpdate = false;
        var pauseSymbolTimeout;
        var isZooming = false;
        var isPanning = false;
        var isUpdating = false;
        var needsUpdate = false;
        var eraseZoom = false;
        var tooltipMax = 5;
        var dataSourceCount = scope.symbol.DataSources.length || 0;
        runtimeData.zoomPanAxisRanges = null;
        runtimeData.syncTime = null;
        runtimeData.uomList = [];

        PV.xyData.setWebServices(webServices);
        PV.xyData.setLog(log);
        
        // For button tooltips in template
        /*scope.XYPlotZoomInTooltip = PV.ResourceStrings.XYPlotZoomInTooltip;
        scope.XYPlotZoomOutTooltip = PV.ResourceStrings.XYPlotZoomOutTooltip;
        scope.XYPlotZoomTooltip = PV.ResourceStrings.XYPlotZoomTooltip;*/
        scope.XYPlotPanTooltip = PV.ResourceStrings.XYPlotPanTooltip;
        scope.XYPlotResetTooltip = PV.ResourceStrings.XYPlotResetTooltip;             

        scope.chartOptions = {
            renderAs: (touchDetection.touchEnabled) ? "canvas" : "svg",
            title: {
                visible: scope.config.ShowTitle,
                text: scope.config.Title,
                color: scope.config.TitleColor,
                position: scope.config.TitlePosition
            },
            legend: {
                visible: scope.config.ShowLegend,
                position: scope.config.LegendPosition,
                labels: {
                    color: scope.config.LegendColor 
                },
                item: {
                    visual: function (e) {
                        var labelColor = e.options.labels.color;
                        var markerColor = e.options.markers.background;
                        var labelText = e.series.name.split('\n');

                        var maxWidth = 0;
                        var maxHeight = 0;
                        for (var i = 0; i < labelText.length; i++) {
                            var test = new kendo.drawing.Text(labelText[i] + 'X', [0, 0], {});
                            var bbox = test.rawBBox();
                            if (bbox.size.width > maxWidth) {
                                maxWidth = bbox.size.width;
                            }
                            if (bbox.size.height > maxHeight) {
                                maxHeight = bbox.size.height;
                            }
                        }
                        
                        var layoutHeight = (maxHeight * labelText.length) + 5;                                               
                        var rect = new kendo.geometry.Rect([0, 0], [maxWidth + 20, layoutHeight]);
                        var layout = new kendo.drawing.Layout(rect);

                        var style = '';
                        if (!isNaN(e.series.id)) {
                            var series = runtimeData.seriesList[e.series.id];
                            style = series.markerStyle || PV.XYPlotConfig.configure.markerStyles[e.series.id % 11];
                        }
    
                        var marker = drawMarker(style, markerColor, new kendo.geometry.Rect([0, 4], [8, 8]))
                        

                        //build label
                        var group = new kendo.drawing.Group();
                        var label;
                        var yPos = 0;
                        
                        for (var i = 0; i < labelText.length; i++) {
                            label = new kendo.drawing.Text(labelText[i], [15, yPos], {
                                fill: {
                                    color: labelColor
                                }
                            });
                            yPos += maxHeight;
                            group.append(label);
                        }

                        var hoverPath = kendo.drawing.Path.fromRect(rect, {
                            cursor: 'pointer',
                            fill: { color: '#fff' },
                            stroke: { color: 'none' },
                            opacity: 0
                        });

                        layout.append(marker);
                        layout.append(group);
                        layout.append(hoverPath);

                        return layout;
                    }
                }
            },
            chartArea: {
                background: scope.config.BackgroundColor,
                height: scope.config.Height,
                width: scope.config.Width
            },
            seriesDefaults: { type: 'scatter' },
            seriesColors: PV.XYPlotConfig.configure.seriesPalette,
            series: createChartSeries(),
            seriesHover: function (e) {
                if (e.series.markers.visible === false) {
                    e.preventDefault();
                }
            },
            xAxis: {
                labels: { color: scope.config.ScaleColor, format: '{0}' },
                line: {color: scope.config.GridColor},
                majorGridLines: {
                    color: scope.config.GridColor, 
                    visible: scope.config.ShowGrid
                },
                name: 'XAxis',
                title: {
                    visible: scope.config.ShowXAxisLabel,
                    text: getChartAxisTitle(runtimeData.seriesList, true),
                    color: scope.config.LegendColor,
                    font: '12px Arial,Helvetica,sans-serif'
                },
                min: (!scope.config.MultiScale && scope.config.ScaleFormat === 'custom') ? Number(scope.config.XScaleMin) : undefined,
                max: (!scope.config.MultiScale && scope.config.ScaleFormat === 'custom') ? Number(scope.config.XScaleMax) : undefined
            },
            yAxis: createChartYAxis(),           
            tooltip: {
                visible: true,
                font: "12px sans-serif",
                template: getTooltip,
                background: 'transparent',
                border: {
                    width: 0
                }
            },
            pannable: false,
           /* zoomable: true,
            zoomStart: onZoomStart,
            zoom: onZoom,
            zoomEnd: onZoomEnd,*/
            dragStart: onDragStart,
            dragEnd: onDragEnd,
            drag: onDrag,
            plotAreaHover: onPlotAreaHover,
            legendItemClick: onLegendItemClick,
            transitions: false
        };

        this.onDisplayTimeChanged = function () {
            runtimeData.syncTime = null;
            setZoomPanOptions('timeChange');
            resumeSeries(runtimeData.seriesList, null, true);
            resumeUpdates();
        };
        timeProvider.onDisplayTimeChanged.subscribe(this.onDisplayTimeChanged);

        scope.$watch('symbol.DataSources', function (nv, ov) {
            if (nv && ov && !angular.equals(nv, ov)) {
                configureSeries(scope.config);
                // check for reordering
                if (nv.length === ov.length) {
                    updateSeriesData();
                } else if (nv.length < ov.length) {
                    refreshChart();
                }
            }
        }, true);     

        scope.isOnlySymbolSelected = function () {
            var selectedSymbols = displayProvider.getSelectedSymbols();
            return (selectedSymbols && selectedSymbols.length == 1);
        }

        scope.preventPopupTrend = function (event) {
            event.stopPropagation();
            event.preventDefault();            
        }

        scope.zoomPanOption = function (o) {            
            setZoomPanOptions(o);
        }
        
        scope.IsPanMode = function () {
            chart = getChart();
            if (chart) {
                return (chart.options.pannable === true);
            }

            return false;
        }

        function setZoomPanOptions(type) {            
            var ignoreRefresh = false;
            chart = getChart();
            if (!chart) {
                return;
            }

            if (type === 'reset' || type === 'timeChange' || type === 'configChange') {
                if (runtimeData.zoomPanAxisRanges) {
                    // If prior zoom is set, redraw axis from the original scale.                    
                    runtimeData.seriesList.forEach(function (series, index) {
                        setChartScales(runtimeData.seriesList[index].scale, index);
                    });
                }

                clearZoom();

                plotExtendedSeriesData();
                chart.options.zoomable = true;
                chart.options.pannable = false;

                // exclude... changes will update data and refresh
                if (type !== 'reset') {
                    ignoreRefresh = true;
                }
            }
            else {
                var panning = (type === 'pan');
                chart.options.zoomable = !panning;
                chart.options.pannable = panning;

                if (type === 'zoomIn' || type === 'zoomOut') {
                    reSizeAxis(type === 'zoomIn');
                }
            }

            if (!ignoreRefresh) {
                refreshChart();
            }
        }
        
        function getReferenceAxisRange() {            
            var axisRange = {};

            runtimeData.seriesList.forEach(function (series, index) {
                var scale = series.scale || {};
                // set x axis once
                if (index === 0) {
                    axisRange.XAxis = { 'min': scale.xMin, 'max': scale.xMax };
                }
                
                if (scope.config.MultiScale) {
                    axisRange[index + ':YAxis'] = { 'min': scale.yMin, 'max': scale.yMax };
                }
                else {
                    axisRange.YAxis = { 'min': scale.yMin, 'max': scale.yMax };
                }                
            });

            return axisRange;
        }

        function getChartAxisRange(chart) {
            // chart object of event
            var axisRange = {};

            if (chart) {
                var chartAxisRange = chart.getAxis('XAxis').range();
                axisRange.XAxis = { 'min': chartAxisRange.min, 'max': chartAxisRange.max };

                if (!scope.config.MultiScale || !chart.options.yAxis.length) {
                    if (scope.config.MultiScale) {
                        chartAxisRange = chart.getAxis('0:YAxis').range();
                        axisRange['0:YAxis'] = { 'min': chartAxisRange.min, 'max': chartAxisRange.max };
                    }
                    else {
                        chartAxisRange = chart.getAxis('YAxis').range();
                        axisRange.YAxis = { 'min': chartAxisRange.min, 'max': chartAxisRange.max };
                    }                    
                }
                else {                        
                    chart.options.yAxis.forEach(function (axis) {
                        var axisName = axis.name;
                        chartAxisRange = chart.getAxis(axisName).range();
                        axisRange[axisName] = { 'min': chartAxisRange.min, 'max': chartAxisRange.max };
                    });
                }
            }

            return axisRange;
        }

        function reSizeAxis(zoomIn) {
            var zoomMargin = (zoomIn) ? -0.15 : 0.15;
            var axisRange = (runtimeData.zoomPanAxisRanges)
                            ? runtimeData.zoomPanAxisRanges
                            : getReferenceAxisRange();

            for (var axisName in axisRange) {
                var axis = axisRange[axisName];
                var delta = (zoomMargin * (axis.max - axis.min))/2;
                axis.max = axis.max + delta;
                axis.min = axis.min - delta;
            }

            setChartAxisRange(axisRange, true);
        }

        function onPlotAreaHover(e) {
            // noticed - mousewheel zoom flickers both cursors, check zoomable as well
            // In boundary conditions, plotarea hover fires on div/chart as well tagging with grab cursor
            // path ensures target is limited to plotarea only.            
            if (e.element.tagName === 'path') {
                var chart = e.sender;
                e.element.style.cssText = (chart.options.pannable === true && chart.options.zoomable === false)
                    ? "cursor: -webkit-grab;-moz-grab;grab;"
                    : "cursor: default;";
            }                      
        }

        function clearZoom() {
            // reset the zoom variable
            runtimeData.zoomPanAxisRanges = null;
            eraseZoom = false;
        }

        function dataUpdate(data) {
            if (!data || pauseSymbolUpdate || isZooming || isPanning) {
                return;
            }

            chart = getChart();
            if (!chart) { return; }
            
            if (data.Data) {
                updateRuntimeData(data.Data);
                processResults(data.Data);
            }
        }

        function onZoomStart(e) {  
            var chart = e.sender;
            if (scope.layoutMode || (chart.options.zoomable === false) || (!runtimeData.zoomPanAxisRanges && e.delta && e.delta > 0)) {
                e.preventDefault();                
                return;
            }
            else {
                isZooming = true;
            } 
        }
        
        function onZoom(e) {
            var chart = e.sender;
            // For touch device zoom gives the ranges and zoom end fires with empty ranges
            // Store zoom settings and use for zoom end, so don't refresh data.
            if (!(scope.layoutMode || (chart.options.zoomable === false)) && scope.touchEnabled) {
                isZooming = true;
                setChartAxisRange(e.axisRanges, false);
            }
        }

        function onZoomEnd(e) {
            var chart = e.sender;
            if (!(scope.layoutMode || (chart.options.zoomable === false))) {                
                seterrorAndRegressionOptions(chart);
                // For touch use the stored values in zoomAxisRange and refresh chart.
                if (scope.touchEnabled) {
                    refreshChart();
                    isZooming = false;
                }                 
                else if (e.axisRanges && e.axisRanges.XAxis) {
                    setChartAxisRange(e.axisRanges, true);
                }
                else {
                    setChartAxisRange(getChartAxisRange(chart), true);
                }
            }
        }

        function onDragStart(e) {
            // Disallow touch operations from device with Touch not-enabled.
            // e.originalEvent.event returns undefined for zooming events, guard for this scenario
            var chart = e.sender;
            if (scope.layoutMode || (!scope.touchEnabled && e.originalEvent.event && e.originalEvent.event.type === 'touchmove')) {
                e.preventDefault();
                return;
            }
            else if (!scope.touchEnabled && chart._zoomSelection && chart._zoomSelection._marquee) {
                e.preventDefault();
                return;
                /*
                // override marquee styles for rubberband zoom
                angular.element(chart._zoomSelection._marquee).addClass('k-marquee-xyplot');

                // get div for k-marquee-color 
                var marqueecolor = angular.element(chart._zoomSelection._marquee).find('div');
                if (marqueecolor) {
                    angular.element(marqueecolor).addClass('k-marquee-color-xyplot');
                }
                */
            }
        }

        function onDrag(e) {             
            // pan only if zoom is set, prevent chart from crossing over.            
            var chart = e.sender;

            // fix - mouse wheel followed by rubberband fails to lock panning to initial min and max scales. 
            if (chart.options.zoomable === false) {
                // Prevent document scrolling on mousewheel zoom, check originalEvent is null on touch.                 
                if (e.originalEvent) {
                    e.originalEvent.preventDefault();
                }
                    
                if (e.axisRanges) {
                    var seriesList = runtimeData.seriesList;
                    for (var axisName in e.axisRanges) {
                        var axis = e.axisRanges[axisName];
                        var axisIndex = axisName.replace(':YAxis', '');
                        // axisIndex is not integer for single axis, use scale for first series. 
                        if (isNaN(axisIndex)) {
                            axisIndex = 0;
                        }

                        if (seriesList.length > axisIndex) {
                            var series = seriesList[axisIndex];
                            if (series.scale) {
                                var scaleMax = (axisName === 'XAxis') ? series.scale.xMax : series.scale.yMax;
                                var scaleMin = (axisName === 'XAxis') ? series.scale.xMin : series.scale.yMin;
                                if (axis.min < scaleMin || axis.min > scaleMax) {                                   
                                    // stop plotting, drag-end refreshed with good values.
                                    e.preventDefault();
                                    return;
                                }
                            }
                        }                        
                    }

                    // set panning to pause data refresh
                    isPanning = true;
                }                 
            }
            seterrorAndRegressionOptions(chart);
        }

        function onDragEnd(e) {
            isZooming = false;
            // if panning refresh chart, if zooming defer till zoom end 
            var chart = e.sender;
            if (!scope.layoutMode && chart.options.zoomable === false) {  
                // Prevent document scrolling on mousewheel zoom, check originalEvent is null on touch.                 
                if (e.originalEvent) {
                    e.originalEvent.preventDefault();
                }

                // set ranges for refresh cycle. 
                if (isPanning) {
                    toggleZoomPan(e.axisRanges);
                    isPanning = false;
                }
                
                if (needsUpdate) {
                    needsUpdate = false; 
                    plotExtendedSeriesData();
                    refreshChart();
                }
            }
        }

        function seterrorAndRegressionOptions() {
            // handle error points and regression line for zooming & panning
            chart = getChart();
            if (!chart) { return; }

            chart.options.series.forEach(function (series) {
                var isErrorPoint = (series.id.toString().indexOf(':err') !== -1);
                var isCorelationLine = (series.id.toString().indexOf(':correlationLine') !== -1);

                if (isErrorPoint || isCorelationLine) {
                    if (isErrorPoint) {
                        series.visible = false;
                    }
                    needsUpdate = true;
                }
            });
        }

        function toggleZoomPan(axisRanges) {
            if (!runtimeData.zoomPanAxisRanges) {
                scope.config.zoomToggle = !scope.config.zoomToggle;
            }
            runtimeData.zoomPanAxisRanges = axisRanges;
        }

        // this event fires before the target series' visible flag is changed
        function onLegendItemClick(e) {
            var targetIndex = e.seriesIndex;

            // disallow disabling all series
            if (chart.options.series[targetIndex].visible) {
                var lastVisibleSeries = true;
                for (var index = 0; index < chart.options.series.length; index++) {
                    if (index !== targetIndex && chart.options.series[index].id.toString().indexOf(':') === -1) {
                        lastVisibleSeries = lastVisibleSeries && !chart.options.series[index].visible;
                    }
                }

                if (lastVisibleSeries) {
                    e.preventDefault();
                    return;
                }
            }

            chart.options.series.filter(function (series, index) {
                return index > targetIndex && (series.id.toString().split(':')[0] === '' + targetIndex);
            }).forEach(function (series) {
                series.visible = !(chart.options.series[targetIndex].visible);
            });
        }
        
        function setChartAxisRange(axisRange, refresh) {
            var seriesList = runtimeData.seriesList;
            var zoomViolation = true;
            var processChanges = false;
            if (axisRange && seriesList) {
                for (var axisName in axisRange) {
                    var axis = axisRange[axisName];      
                    var axisIndex = axisName.replace(':YAxis', '');
                    processChanges = true;

                    // account for non numeric values rest to last good config.
                    if (isNaN(axis.min) || isNaN(axis.max)) {
                        processChanges = false;
                        break;
                    }
                    
                    // axisIndex is not integer for single axis, use scale for first series. 
                    if (isNaN(axisIndex)) {
                        axisIndex = 0;
                    }

                    if (seriesList.length > axisIndex) {
                        var series = seriesList[axisIndex];
                        if (series.scale) {
                            var scaleMax = (axisName === 'XAxis') ? series.scale.xMax : series.scale.yMax;
                            var scaleMin = (axisName === 'XAxis') ? series.scale.xMin : series.scale.yMin;

                            // Has panning extended the scales, dont scope to original scale?
                            var scalesExtended = false;
                            if (runtimeData.zoomPanAxisRanges) {
                                for (var runAxis in runtimeData.zoomPanAxisRanges) {
                                    if (runAxis === axisName) {                                    
                                        var savedAxis = runtimeData.zoomPanAxisRanges[axisName];
                                        scalesExtended = (savedAxis.max > scaleMax) || (savedAxis.min < scaleMin);
                                        break;
                                    }
                                }
                            }
                            
                            if (!scalesExtended) {
                                // restrict zoom selection to 1% of original scale.
                                var allowedDifference = 0.01 * (scaleMax - scaleMin);
                                var axisDifference = axis.max - axis.min;

                                // update axis for refresh to work, past timeframes will not trigger data updates.                            
                                if (axisDifference < allowedDifference) {
                                    if ((scaleMax - axis.max) < allowedDifference) {
                                        axis.max = scaleMax;
                                        axis.min = scaleMax - allowedDifference;
                                    }
                                    else if ((axis.min - scaleMin) < allowedDifference) {
                                        axis.min = scaleMin;
                                        axis.max = scaleMin + allowedDifference;
                                    }
                                    else {
                                        axis.min = axis.max - allowedDifference;
                                    }
                                }

                                // is any axis within the scale?
                                if ((axis.max < scaleMax && axis.max > scaleMin)
                                    || (axis.min < scaleMax && axis.min > scaleMin)) {
                                    zoomViolation = false;
                                }

                                // for exceptions, reset the max & min to plot chart to original
                                if (scaleMax < axis.max || axis.max < scaleMin) {
                                    axis.max = scaleMax;
                                }
                                if (scaleMin > axis.min || axis.min > scaleMax) {
                                    axis.min = scaleMin;
                                }

                                // range crossover detected in input ranges.
                                if (axis.min > axis.max) {
                                    var thisMin = axis.min;
                                    axis.min = axis.max;
                                    axis.max = thisMin;
                                }
                            }
                        }
                    }                    
                }
                
                if (processChanges === true) {                    
                    eraseZoom = zoomViolation;

                    toggleZoomPan(axisRange);
                }
                
                // reeval the error points and regression
                if (needsUpdate) {
                    needsUpdate = false;
                    plotExtendedSeriesData();                
                }
                
                // refresh not needed, still zooming other methods will handle completion.
                if (!refresh) {
                    return;
                }

                // refresh chart for changes or the last good state.
                refreshChart();
            }

            // resume updates to continue data refresh.
            isZooming = false;
        }

        function getScaleFormat(min, max, format, showThousands) {
            var showComma = false;
            if (!min && !max) {
                return '{0:N}';
            }

            if (format === 'Database' || (format === 'Number' && showThousands)) {
                showComma = true;
            }

            var difference = max - min;
            if (difference > 1E6 || format === 'Scientific') {
                return '{0:e2}';    // 1E6 limits label overlap in the x-axis
            }
            else if (difference > 10 || difference <= 0) {
                return (showComma) ? '{0:,#}' : '{0:#}';
            }

            var decimals = 1 - Math.floor(Math.log(difference) / Math.log(10));
            if (showComma) {
                return '{0:,#.' + Array(decimals + 1).join('0') + '}';
            }
            return '{0:#.' + Array(decimals + 1).join('0') + '}';
        }

        function getAdjustedScale(scale,index) {
            var xMin = scale.xMin;
            var xMax = scale.xMax;
            var yMin = scale.yMin;
            var yMax = scale.yMax;
            var yAxisName = 'YAxis';

            if (scope.config.MultiScale) {
                yAxisName = index + ':YAxis';
            }

            if (runtimeData.zoomPanAxisRanges) {
                for (var axisName in runtimeData.zoomPanAxisRanges) {
                    var axis = runtimeData.zoomPanAxisRanges[axisName];
                    if (axisName === 'XAxis') {
                        xMin = axis.min;
                        xMax = axis.max;
                    }
                    else if (axisName === yAxisName) {
                        yMin = axis.min;
                        yMax = axis.max;
                    }                    
                }
            }

            return { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };
        }

        function refreshChart() {
            chart = getChart();
            if (chart) {                
                if (getSeriesList().length) {
                    setZoomAxisRanges(chart);
                    setScaleFormat(chart);
                }
                chart.refresh();

                if (eraseZoom) {
                    clearZoom();                    
                }
            }
        }

        // apply zoom axis ranges to chart
        function setZoomAxisRanges(chart) {
            if (runtimeData.zoomPanAxisRanges) {
                for (var axisName in runtimeData.zoomPanAxisRanges) {
                    var axis = runtimeData.zoomPanAxisRanges[axisName];
                    var min = axis.min;
                    var max = axis.max;

                    if (axisName === 'XAxis') {
                        chart.options.xAxis.labels.format = getScaleFormat(min, max);
                        chart.options.xAxis.min = min;
                        chart.options.xAxis.max = max;
                    }
                    else {
                        var index = axisName.replace(':YAxis', '');
                        if (!isNaN(index) && !isNaN(chart.options.yAxis.length)) {
                            chart.options.yAxis[index].min = min;
                            chart.options.yAxis[index].max = max;
                            chart.options.yAxis[index].visible = true;
                        }
                        else {
                            chart.options.yAxis.min = min;
                            chart.options.yAxis.max = max;
                            chart.options.yAxis.visible = true;
                        }
                    }
                }
            }
        }

        // set scale formatting
        function setScaleFormat(chart) {
            var min, max, options, format, thousands;
            var seriesList = runtimeData.seriesList;
            var dataSettings = scope.config.DataSettings || {};
            var config = scope.config;
            var multipleX = Object.keys(dataSettings).reduce(function (hasMultipleX, x) {
                return hasMultipleX || !!(dataSettings[x] && dataSettings[x].IsX);
            }, false);

            // ensure multiscale and yAxis valid, handle multiaxis with 1 x and no y's errors
            if (!isNaN(chart.options.yAxis.length)) {                
                if (multipleX) {
                    format = config.NumberFormat;
                    thousands = config.NumberThousands;
                } else {
                    options = getNumberFormatOptions(seriesList[0].x);
                    format = options.format;
                    thousands = options.thousands;
                }

                min = chart.options.xAxis.min;
                max = chart.options.xAxis.max;
                chart.options.xAxis.labels.format = getScaleFormat(min, max, format, thousands);

                seriesList.forEach(function (series, index) {
                    options = getNumberFormatOptions(series.y);
                    min = chart.options.yAxis[index].min;
                    max = chart.options.yAxis[index].max;
                    chart.options.yAxis[index].labels.format = getScaleFormat(min, max, options.format, options.thousands);
                });
            }
            else {
                ['x', 'y'].forEach(function (xy) {
                    if (seriesList.length === 1 || (seriesList.length !== 0 && !multipleX && (xy === 'x'))) {
                        options = getNumberFormatOptions(seriesList[0][xy]);
                        format = options.format;
                        thousands = options.thousands;
                    }
                    else {
                        format = config.NumberFormat;
                        thousands = config.NumberThousands;
                    }
                    
                    min = chart.options[xy + 'Axis'].min;
                    max = chart.options[xy + 'Axis'].max;

                    chart.options[xy + 'Axis'].labels.format = getScaleFormat(min, max, format, thousands);
                });
            }
        }

        function pauseUpdates(millisecs) {
            millisecs = millisecs || 5000;
            if (pauseSymbolTimeout) {
                $timeout.cancel(pauseSymbolTimeout);
                pauseSymbolTimeout = null;
            }
            pauseSymbolTimeout = $timeout(function () {
                pauseSymbolUpdate = false;
            }, millisecs);
            pauseSymbolUpdate = true;
        }

        function resumeUpdates() {
            if (pauseSymbolTimeout) {
                $timeout.cancel(pauseSymbolTimeout);
                pauseSymbolTimeout = null;
            }
            pauseSymbolUpdate = false;
        }

        function getChart() {
            if (!chart) {
                chart = elem.find('.chart').data('kendoChart');                
            }
            return chart;
        }

        function configureSeries(config) {
            dataSourceCount = scope.symbol.DataSources.length || 0;
            chart = getChart();
            chart.options.series.length = 0;
            chart.options.series = createChartSeries(config);
            chart.options.yAxis = createChartYAxis(config);
        }

        function createChartSeries(config) {
            config = config || scope.config;
            runtimeData.seriesList = PV.XYPlotConfig.configure.createSeriesList(config, scope.symbol.DataSources, getDisplayLegend, runtimeData.uomList);
            var chartSeries = [];

            runtimeData.seriesList.forEach(function (series, index) {
                var newSeries = {
                    id: index,
                    type: series.showLine ? 'scatterLine' : 'scatter',
                    name: series.name,
                    data: [],
                    markers: getMarkers(series, index),
                    tooltip: {
                        visible: true
                    }
                };                
                if (series.color) {
                    newSeries.color = series.color;
                }                
                if (config.MultiScale) {
                    newSeries.yAxis = index + ':YAxis';
                }
                chartSeries.push(newSeries);
            });

            if (chartSeries.length > 0) {
                return chartSeries;
            }
            else {
                return [{ type: 'scatter' }];
            }
        }

        function createChartYAxis(config) {
            config = config || scope.config;
            var seriesList = getSeriesList();

            if (config.MultiScale) {
                var chartYAxis = [];
                var newAxis;

                seriesList.forEach(function (series, index) {
                    newAxis = {
                        line: { color: scope.config.GridColor },
                        majorGridLines: {
                            color: scope.config.GridColor,
                            visible: scope.config.ShowGrid
                        },
                        name: index + ':YAxis',
                        labels: {
                            format: '{0}',
                            color: series.color
                        }
                    };
                    if (index === seriesList.length - 1) {
                        newAxis.title = {
                                visible: config.ShowYAxisLabel,
                                text: getChartAxisTitle(runtimeData.seriesList, false),
                                color: config.LegendColor,
                                font: '12px Arial,Helvetica,sans-serif'
                        }
                    }
                    chartYAxis.push(newAxis);
                });

                return chartYAxis;
            }
            else {
                return {
                    line: { color: scope.config.GridColor },
                    majorGridLines: {
                        color: scope.config.GridColor,
                        visible: scope.config.ShowGrid
                    },
                    labels: { color: scope.config.ScaleColor, format: '{0}' },
                    name: 'YAxis',
                    title: {
                        visible: config.ShowYAxisLabel,
                        text: getChartAxisTitle(runtimeData.seriesList, false),
                        color: config.LegendColor,
                        font: '12px Arial,Helvetica,sans-serif'
                    },
                    min: (!config.MultiScale && config.ScaleFormat === 'custom') ? Number(config.YScaleMin) : undefined,
                    max: (!config.MultiScale && config.ScaleFormat === 'custom') ? Number(config.YScaleMax) : undefined
                };
            }
        }

        function configChanged(newConfig, oldConfig) {
            if (!angular.equals(newConfig, oldConfig)) {
                if (!angular.equals(newConfig.zoomToggle, oldConfig.zoomToggle)) {
                    return;
                }

                // handle config changes - clear zoom                
                setZoomPanOptions('configChange');

                var newSettings = newConfig.DataSettings || [];
                var oldSettings = oldConfig.DataSettings || [];

                setOptions(newConfig,
                    (newConfig.MultiScale !== oldConfig.MultiScale),
                    (oldConfig.ScaleFormat !== newConfig.ScaleFormat),
                    (seriesCount(oldSettings) !== seriesCount(newSettings)));

                // recheck webAPI query limit for every series after any config change
                // also clears the query limit error message from the logs
                resumeSeries(runtimeData.seriesList, null, true);
                resumeUpdates();

                //TODO: determine a better way to know IF a update is needed
                //if (!areArraysEqual(newSettings, oldSettings)) {
                updateSeriesData();
                //}
            }            
        }

        function seriesCount(settings) {
            var count = 1;
            var dataSources = scope.symbol.DataSources;
            for (var i = 1; i < dataSources.length; i++) {
                if (!settings[i] || !settings[i].IsX) {
                    count++;
                }
            }
            return count;
        }

        function resize(width, height) {
            var chart = elem.find('.chart').data('kendoChart');
            if (chart) {
                delete chart.options.chartArea.height;
                delete chart.options.chartArea.width;
                $timeout(function () {
                    //todo: latest kendo version has resize method
                    refreshChart();
                }, 0);
            }
        }

        function setOptions(config, scaleChange, scaleFormatChanged, seriesCountChange) {
            chart = getChart();
            if (!chart) { return; }

            var dataSources = scope.symbol.DataSources || [];

            if (seriesCountChange || dataSourceCount != dataSources.length) {
                configureSeries(config); // will create new  runtimeData.seriesList
            }
            else {
                runtimeData.seriesList = PV.XYPlotConfig.configure.createSeriesList(config, dataSources, getDisplayLegend, runtimeData.uomList);
            }

            if (scaleChange || scaleFormatChanged || (config.MultiScale && seriesCountChange)) {
                if (scaleChange || (config.MultiScale && seriesCountChange)) {
                    chart.options.yAxis = createChartYAxis(config);
                }

                if (config.ScaleFormat === 'autorange') {
                    runtimeData.seriesList.forEach(function (series, index) {
                        setScaleAutorange(runtimeData.seriesList, config.MultiScale ? index : 999);
                    });
                }
            }

            setSeriesOptions(chart, runtimeData.seriesList, config);

            chart.options.chartArea.background = config.BackgroundColor;

            if (config.ShowTitle) {
                chart.options.title.visible = config.Title ? true : false;
                chart.options.title.text = config.Title;
                chart.options.title.position = config.TitlePosition;
                chart.options.title.color = config.TitleColor;
            }
            else {
                chart.options.title.visible = false;
            }

            chart.options.xAxis.majorGridLines.visible = config.ShowGrid;
            chart.options.xAxis.majorGridLines.color = config.GridColor;
            chart.options.xAxis.line.color = config.GridColor;
            if (!isNaN(chart.options.yAxis.length)) {
                chart.options.yAxis.forEach(function (axis) {
                    axis.majorGridLines.visible = config.ShowGrid;
                    axis.majorGridLines.color = config.GridColor;
                    axis.line.color = config.GridColor;
                });
            }
            else {
                chart.options.yAxis.majorGridLines.visible = config.ShowGrid;
                chart.options.yAxis.majorGridLines.color = config.GridColor;
                chart.options.yAxis.line.color = config.GridColor;
            } 

            if (config.ShowLegend) {
                chart.options.legend.visible = true;
                chart.options.legend.position = config.LegendPosition;
                chart.options.legend.labels.color = config.LegendColor;
            }
            else {
                chart.options.legend.visible = false;
            }

            if (config.ShowXAxisLabel) {
                chart.options.xAxis.title.visible = true;               
                chart.options.xAxis.title.color = config.LegendColor;
                chart.options.xAxis.title.text = getChartAxisTitle(runtimeData.seriesList, true);
            }
            else {
                chart.options.xAxis.title.visible = false;
            }            

            var yAxisTitle = !chart.options.yAxis.length ? chart.options.yAxis.title : chart.options.yAxis[chart.options.yAxis.length - 1].title;
            // check for yAxisTitle, case with 1 series with only x, no y errors...
            if (yAxisTitle) {
                if (config.ShowYAxisLabel) {
                    yAxisTitle.visible = true;
                    yAxisTitle.color = config.LegendColor;
                    yAxisTitle.text = getChartAxisTitle(runtimeData.seriesList, false);
                }
                else {
                    yAxisTitle.visible = false;
                }
            }

            if (!config.MultiScale && config.ScaleFormat === 'custom') {
                var scale = getCustomScale();
                setChartScales(scale);
            }

            chart.options.xAxis.labels.color = config.ScaleColor;
            if (!config.MultiScale) {
                chart.options.yAxis.labels.color = config.ScaleColor;
            }

            refreshChart();
        }

        function setScaleAutorange(seriesList, seriesIndex) {
            var xMin = Number.MAX_VALUE;
            var yMin = Number.MAX_VALUE;
            var xMax = -Number.MAX_VALUE;
            var yMax = -Number.MAX_VALUE;
            var scale;
                        
            seriesList.forEach(function (series, index) {                
                var seriesRange = getSeriesRange(series, seriesIndex, index, xMin, xMax, yMin, yMax);
                if (seriesRange.rangeChanged) {
                    xMin = seriesRange.xMin;
                    xMax = seriesRange.xMax;
                    yMin = seriesRange.yMin;
                    yMax = seriesRange.yMax;
                }
            });

            if (xMin === Number.MAX_VALUE && yMin === Number.MAX_VALUE) {
                xMin = -1;
                yMin = -1;
                xMax = 1;
                yMax = 1;
            }
            else {
                var rangeX = calculateMinMax(xMin, xMax);
                var rangeY = calculateMinMax(yMin, yMax);
                xMin = rangeX.min;
                xMax = rangeX.max;
                yMin = rangeY.min;
                yMax = rangeY.max;
            }

            scale = { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };

            // sync X scale with other series
            seriesList.forEach(function (series, index) {
                if (isNaN(seriesIndex) || seriesIndex === index) {
                    series.scale = scale;
                }
                if (series.scale) {
                    series.scale.xMin = Math.min(series.scale.xMin, scale.xMin);
                    series.scale.xMax = Math.max(series.scale.xMax, scale.xMax);
                }
            });

            if (scope.config.MultiScale) {
                setChartScales(seriesList[seriesIndex].scale, seriesIndex);
            }
            else {
                setChartScales(scale);
            }
        }

        // Helper function for setScaleAutorange
        function calculateMinMax(min, max) {
            if (min === Number.MAX_VALUE) {
                min = 0;
                max = 1;
            }
            else {
                var scale = PV.xyAutoRange.CalculateScaleValues(min, max);
                if (isNaN(scale) || scale === -2) { // range value is effectively zero
                    if (scale === -2) {
                        min--;
                        max++;
                    }
                    else {
                        min = scale.min;
                        max = scale.max;
                    }
                }
                else {
                    min = -1;
                    max = 1;
                }
            }
            return { min: min, max: max };
        }

        function setChartScales(scale, seriesIndex) {
            chart.options.xAxis.min = scale.xMin;
            chart.options.xAxis.max = scale.xMax;

            if (isNaN(seriesIndex) || isNaN(chart.options.yAxis.length)) {  //single scale
                chart.options.yAxis.min = scale.yMin;
                chart.options.yAxis.max = scale.yMax;
            }
            else if (seriesIndex < chart.options.yAxis.length) {
                chart.options.yAxis[seriesIndex].min = scale.yMin;
                chart.options.yAxis[seriesIndex].max = scale.yMax;
            }

            // force x-axis to the bottom.
            if (!scope.config.MultiScale || !chart.options.yAxis.length) {
                chart.options.yAxis.axisCrossingValue = (2 * chart.options.yAxis.min) - chart.options.yAxis.max - 1;
            }
            else {
                // find smallest minimum
                var min = Math.min.apply(Math, chart.options.yAxis.map(function (axis) { return axis.min; }));
                chart.options.yAxis.forEach(function (axis) {
                    axis.axisCrossingValue = (2 * axis.min) - axis.max - 1;
                });
            }
            // force y-axis (or axes) to the left
            chart.options.xAxis.axisCrossingValue = (2 * chart.options.xAxis.min) - chart.options.xAxis.max - 1;
        }

        function getSeriesRange(series, seriesIndex, index, thisXMin, thisXMax, thisYMin, thisYMax) {
            var xMin = thisXMin;
            var xMax = thisXMax;
            var yMin = thisYMin;
            var yMax = thisYMax;            
            var seriesData = [];
            var errorData = [];

            if (series.data) {
                seriesData = series.data.pointData || [];
                errorData = series.data.errorData || [];
            }

            seriesData.forEach(function (point) {
                xMin = (point[0] < xMin) ? point[0] : xMin;
                xMax = (point[0] > xMax) ? point[0] : xMax;

                if (isNaN(seriesIndex) || seriesIndex === index) {
                    yMin = (point[1] < yMin) ? point[1] : yMin;
                    yMax = (point[1] > yMax) ? point[1] : yMax;
                }
            });

            // account for any 'good' values in the errors
            errorData.forEach(function (point) {
                if (!isNaN(point[0])) {
                    xMin = (point[0] < xMin) ? point[0] : xMin;
                    xMax = (point[0] > xMax) ? point[0] : xMax;
                }

                if (!isNaN(point[1]) && (isNaN(seriesIndex) || seriesIndex === index)) {
                    yMin = (point[1] < yMin) ? point[1] : yMin;
                    yMax = (point[1] > yMax) ? point[1] : yMax;
                }
            });
 
            var rangeChanged = (xMin !== thisXMin || xMax !== thisXMax
                || yMin !== thisYMin || yMax !== thisYMax);

            return { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax, rangeChanged: rangeChanged };
        }

        function getPIPointRange(settings, min, max) {
            var theMin = min;
            var theMax = max;
            var valuesGood = false;
            if (!isNaN(settings.zero) && settings.zero !== 'N/A' && !isNaN(settings.span) && settings.span !== 'N/A')
            {
                valuesGood = true;
                if (settings.zero < min) {
                    theMin = settings.zero;
                }
                if (settings.zero + settings.span > max) {
                    theMax = settings.zero + settings.span;
                }
            }

            return { Min: theMin, Max: theMax, valuesGood: valuesGood };
        }

        function getAFTraitRange(minAttr, maxAttr, min, max) {
            var theMin = min;
            var theMax = max;
            var valuesGood = false;

            if (minAttr && minAttr.Status === 200 && maxAttr && maxAttr.Status === 200) {                
                if (minAttr.Content.Value < theMin) {
                    theMin = minAttr.Content.Value;
                }
                if (maxAttr.Content.Value > theMax) {
                    theMax = maxAttr.Content.Value;
                }
                valuesGood = (theMin < theMax);
            }
            return { Min: theMin, Max: theMax, valuesGood: valuesGood };
        }

        function setScaleDatabase(seriesList, seriesIndex) {
            var dataSettings = scope.config.DataSettings || [];            
            var xMin = Number.MAX_VALUE;
            var yMin = Number.MAX_VALUE;
            var xMax = -Number.MAX_VALUE;
            var yMax = -Number.MAX_VALUE;
            var piPointRange;
            var afTraitRange;
            var seriesRange;
            var allGood = true;
            var yIsGood = true;

            seriesList.forEach(function (series, index) {
                var xSettings = series.x;
                var ySettings = series.y;

                // go with fallbackToAuto false -- most cases will not change this variable.
                var fallbackToAuto = false;

                if (scope.config.MultiScale) {
                    yMin = Number.MAX_VALUE;
                    yMax = -Number.MAX_VALUE;
                }

                // PI Point
                piPointRange = getPIPointRange(xSettings, xMin, xMax);
                if (!isAF(xSettings.index)) {                    
                    if (piPointRange.valuesGood) {
                        xMin = piPointRange.Min;
                        xMax = piPointRange.Max;
                    }
                    else {
                        fallbackToAuto = true;
                    }
                }
                else {
                    // AF Traits
                    afTraitRange = getAFTraitRange(series.afTraits.XMinimum, series.afTraits.XMaximum, xMin, xMax);
                    if (afTraitRange.valuesGood) {
                        xMin = afTraitRange.Min;
                        xMax = afTraitRange.Max;
                    }
                    else if (piPointRange.valuesGood) {
                        xMin = piPointRange.Min;
                        xMax = piPointRange.Max;
                    }
                    else {
                        fallbackToAuto = true;                       
                    }                                   
                }

                if (fallbackToAuto === true) {
                    // fallback to autorange for this series data only
                    seriesRange = getSeriesRange(series, seriesIndex, index, xMin, xMax, yMin, yMax);
                    if (seriesRange.rangeChanged) {
                        var rangeX = calculateMinMax(seriesRange.xMin, seriesRange.xMax);
                        xMin = rangeX.min;
                        xMax = rangeX.max;
                    }
                    else {
                        allGood = false;
                    }
                }

                // reset fallbackToAuto for Y
                fallbackToAuto = false;
                piPointRange = getPIPointRange(ySettings, yMin, yMax);
                if (!isAF(ySettings.index)) {
                    if (piPointRange.valuesGood) {
                        yMin = piPointRange.Min;
                        yMax = piPointRange.Max;
                    }
                    else {
                        fallbackToAuto = true;
                    }
                }
                else {
                    // AF Traits
                    afTraitRange = getAFTraitRange(series.afTraits.YMinimum, series.afTraits.YMaximum, yMin, yMax);
                    if (afTraitRange.valuesGood) {
                        yMin = afTraitRange.Min;
                        yMax = afTraitRange.Max;
                    }
                    else if (piPointRange.valuesGood) {
                        yMin = piPointRange.Min;
                        yMax = piPointRange.Max;
                    }
                    else {
                        fallbackToAuto = true;                       
                    }                    
                }

                if (fallbackToAuto === true) {
                    // fallback to autorange for this series data only
                    seriesRange = getSeriesRange(series, seriesIndex, index, xMin, xMax, yMin, yMax);
                    if (seriesRange.rangeChanged) {
                        var rangeY = calculateMinMax(seriesRange.yMin, seriesRange.yMax);
                        yMin = rangeY.min;
                        yMax = rangeY.max;
                    }
                    else {
                        allGood = false;
                        yIsGood = false;
                    }
                }

                // sync database scales if series.data is undefined.
                if (scope.config.MultiScale && (seriesIndex === index || series.data === undefined)) {
                    if (yIsGood) {
                        series.scale = { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax};
                    }
                    else {
                        series.scale = { xMin: xMin, xMax: xMax, yMin: -1, yMax: 1};
                    }
                }

                yIsGood = true;
            });

            if (xMin === Number.MAX_VALUE || yMin === Number.MAX_VALUE ||
                xMax === -Number.MAX_VALUE || yMax === -Number.MAX_VALUE ||
                !allGood) {

                // x has no data, traits or pi points set to -1, 1
                if (xMin === Number.MAX_VALUE || xMax === -Number.MAX_VALUE) {
                    xMin = -1;
                    xMax = 1;
                }

                // for single scale if y has no data, traits or pi points set to -1, 1
                if (!scope.config.MultiScale && (yMin === Number.MAX_VALUE || yMax === -Number.MAX_VALUE)) {
                    yMin = -1;
                    yMax = 1;
                }
            }

            var scale = { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };

            // sync scale with other series
            seriesList.forEach(function (series, index) {
                var scale = series.scale || {};
                scale.xMin = xMin;
                scale.xMax = xMax;
                if (!scope.config.MultiScale) {
                    scale.yMin = yMin;
                    scale.yMax = yMax;
                }
                series.scale = scale;
            });

            if (scope.config.MultiScale) {
                seriesList.forEach(function (series, index) {
                    setChartScales(seriesList[index].scale, index);
                });
            }
            else {
                setChartScales(scale);
            }
        }

        function setSeriesOptions(chart, seriesList, config) {
            if (seriesList.length < chart.options.series.length) {
                chart.options.series.length = seriesList.length;
            }

            seriesList.forEach(function (series, index) {
                var chartSeries = chart.options.series[index] || {};

                chartSeries.type = series.showLine ? 'scatterLine' : 'scatter';
                chartSeries.markers = getMarkers(series, index);
                chartSeries.name = series.name;

                if (config.MultiScale) {                    
                    chart.options.series.forEach(function (series) {
                        var id = series.id.toString().split(':');
                        if (id[0] == chartSeries.id) {
                            series.yAxis = index + ':YAxis';
                        }
                    });
                }
                else {
                    chart.options.series.forEach(function (series) {
                        delete series.yAxis;
                    });
                }

                chartSeries.color = series.color;
                if (config.MultiScale) {
                    if (!isNaN(chart.options.yAxis.length)) {
                        chart.options.yAxis[index].labels.color = series.color;
                    }
                    else {
                        chart.options.yAxis.labels.color = series.color;
                    }
                }

                if (index >= chart.options.series.length) {
                    chart.options.series.push(chartSeries);
                }
            });
        }

        function getSeriesList(config, datasources) {
            if (!runtimeData.seriesList) {
                runtimeData.seriesList = PV.XYPlotConfig.configure.createSeriesList(config, datasources, getDisplayLegend, runtimeData.uomList);
            }
            return runtimeData.seriesList;
        }

        function matchSeriesData(xdata, ydata, joinType, seriesList, index) {
            if (pauseSymbolUpdate || isZooming || isPanning) {
                return;
            }

            if (index < chart.options.series.length) {
                var seriesData = PV.xyPairData.pairSeriesData(xdata, ydata, joinType);
                chart.options.series[index].data = seriesData.pointData;                
                seriesList[index].data = seriesData;
                
                plotSeriesData(seriesList, index);
            }

            plotExtendedSeriesData();
        }

        function plotSeriesData(seriesList, index) {
            var currentSeries = seriesList[index];                                
            var seriesData = currentSeries.data;

            var dataSettings = scope.config.DataSettings || [];
            var currentDataSettings = dataSettings[currentSeries.y.index] || {};

            // update series legend and series y-axis label for dynamic engineering units or to show correlation coefficient   
            if (scope.config.ShowEngineeringUnits === true || currentSeries.showCorrelationCoefficient === true) {
                var correlationCoefficient;
                if (seriesData.statistics && seriesData.statistics.correlationCoefficientValid === true) {
                    correlationCoefficient = seriesData.statistics.correlationCoefficient;
                }

                var legendOptions = {
                    dataSourceLabel: currentSeries.y.label,
                    dataSourcePath: currentSeries.y.path,
                    isAF: isAF(currentSeries.y.index),
                    legendType: currentDataSettings.LegendType,
                    seriesTitle: currentDataSettings.SeriesTitle,
                    showEngineeringUnits: scope.config.ShowEngineeringUnits,
                    uom: (runtimeData.uomList[index]) ? runtimeData.uomList[index].y : null,
                    showCorrelationCoefficient: currentSeries.showCorrelationCoefficient,
                    correlationCoefficient: correlationCoefficient
                };

                chart.options.series[index].name = getDisplayLegend(legendOptions);
            }

            if (scope.config.ScaleFormat === 'autorange') {                
                if (scope.config.MultiScale) {
                    setScaleAutorange(seriesList, index); // full X and single Y scale
                }
                else {
                    setScaleAutorange(seriesList);
                }
            }
            else if (scope.config.ScaleFormat === 'custom') {
                currentSeries.scale = getCustomScale();
                setChartScales(currentSeries.scale);
            }
            else if (scope.config.ScaleFormat === 'database') {
                if (scope.config.MultiScale) {
                    setScaleDatabase(seriesList, index); // full X and single Y scale
                }
                else {
                    setScaleDatabase(seriesList);
                }
            }
        }

        function plotExtendedSeriesData() {
            var seriesList = getSeriesList();

            if (chart.options.series.length > seriesList.length) {
                chart.options.series = chart.options.series.slice(0, seriesList.length);
            }

            // show error point values along min scales
            plotErrorPoints(seriesList);

            // provide linear regression line - display coefficient.
            plotLinearRegressionLine(seriesList);
        }

        function plotLinearRegressionLine(seriesList) {
            seriesList.forEach(function (series, index) {
                if (series.data && series.data.statistics) {
                    var dataSettings = scope.config.DataSettings || [];                    
                    if (series.showCorrelationLine === true && series.data.statistics.regressionValid === true) {
                        var correlationData = []; 
                        var slope = series.data.statistics.slope;
                        var offset = series.data.statistics.offset;
                        var scale = getAdjustedScale(series.scale,index);

                        // calculate x,y coords assuming a horizontal line
                        var x1 = scale.xMin;
                        var y1 = (slope * scale.xMin) + offset;

                        var x2 = scale.xMax;
                        var y2 = (slope * scale.xMax) + offset;

                        // adjust for vertical lines
                        // slope is zero, a horizontal line at offset.
                        if (slope !== 0) {
                            if (y1 < scale.yMin) {
                                x1 = (scale.yMin - offset) / slope;
                                y1 = scale.yMin;
                            }
                            if (y1 > scale.yMax) {
                                x1 = (scale.yMax - offset) / slope;
                                y1 = scale.yMax;
                            }
                            if (y2 < scale.yMin) {
                                x2 = (scale.yMin - offset) / slope;
                                y2 = scale.yMin;
                            }
                            if (y2 > scale.yMax) {
                                x2 = (scale.yMax - offset) / slope;
                                y2 = scale.yMax;
                            }
                        }

                        correlationData.push([x1, y1]);
                        correlationData.push([x2, y2]);

                        var correlationSeries = {
                            id: index + ':correlationLine',
                            name: '',
                            type: 'scatterLine',                            
                            dashType: 'dashDot',
                            color: series.color,
                            width: 2,
                            markers: { visible: false },
                            tooltip: { visible: false },                                                        
                            background: 'transparent',
                            data: correlationData,
                            visible: chart.options.series[index].visible
                        };

                        if (scope.config.MultiScale) { 
                            correlationSeries.yAxis = index + ':YAxis';
                        }

                        chart.options.series.push(correlationSeries);
                    }                
                }
            });
        }

        function plotErrorPoints(seriesList) {                        
            seriesList.forEach(function (series, index) {                
                if (series.data && series.data.errorData.length > 0) {
                    var errorData = [];
                    var scale = getAdjustedScale(series.scale,index);

                    series.data.errorData.forEach(function (point) {
                        var pointX = point[0];
                        var pointY = point[1];
                        var outOfRange = ((pointX === PV.xyPairData.errorValue && pointY !== PV.xyPairData.errorValue
                            && (pointY < scale.yMin || pointY > scale.yMax))
                            || (pointY === PV.xyPairData.errorValue && pointX !== PV.xyPairData.errorValue
                            && (pointX < scale.xMin || pointX > scale.xMax)));

                        if (!outOfRange) {
                            if (pointX === PV.xyPairData.errorValue) {
                                pointX = scale.xMin;
                            }
                            if (pointY === PV.xyPairData.errorValue) {
                                pointY = scale.yMin;
                            }
                            errorData.push([pointX, pointY]);
                        }
                    });

                    var newSeries = {
                        id: index + ':err',
                        type: 'scatter',
                        name: '',
                        highlight: {
                            visual: function (e) {
                                var visual = e.createVisual();
                                visual.options.noclip = true;
                                return visual;
                            }
                        },
                        markers: {
                            type: 'cross',
                            visible: true,
                            visual: function (e) {
                                var visual = e.createVisual();
                                visual.options.noclip = true;
                                return visual;
                            }
                        },
                        color: series.color,
                        data: errorData,
                        visible: chart.options.series[index].visible
                    };

                    if (scope.config.MultiScale) {
                        newSeries.yAxis = index + ':YAxis';
                    }

                    chart.options.series.push(newSeries);
                }
            });
        }

        function clearChartSeriesData(index, clearRelatedSeries) {
            if (index < chart.options.series.length) {
                if (!clearRelatedSeries) {
                    chart.options.series[index].data = [];
                }
                else {
                    chart.options.series.forEach(function (series) {
                        if ('' + index === series.id.toString().split(':')[0]) {
                            series.data = [];
                        }
                    });
                }
            }
        }

        function clearSeriesListData(seriesList, index) {
            if (index < seriesList.length) {
                if (seriesList[index].data) {
                    delete seriesList[index].data;
                }
            }
        }

        function updateSeriesData() {
            //clear-refresh chart when chart series is undefined or only one datasource remain.
            if (runtimeData.seriesList && runtimeData.seriesList.length > 0) {
                isUpdating = true;
                dataPump.requestUpdate();
            }
            else {
                chart.options.series = [{ type: 'scatter' }];
                refreshChart();
            }
        }
            
        function updateRuntimeData(responseData) {
            var seriesList = getSeriesList();

            var getAttribute = function (attributes, property, value) {
                for (var i = 0; i < attributes.length; i++) {
                    if (attributes[i][property] === value) {
                        return attributes[i];
                    }                
                }
                return false; // no match
            };

            var update = function (settings, index, xy) {
                var data;

                data = responseData[settings.index + ':webid'];
                if (data) {
                    if (data.Status == 200) {
                        settings.webId = data.Content.WebId;
                        if (!runtimeData.uomList[index]) {
                            runtimeData.uomList[index] = {};
                        }

                        runtimeData.uomList[index][xy] = data.Content.EngineeringUnits;
                    }
                }

                data = responseData[settings.index + ':trait'];
                if (data) {
                    var traits = data.Content.Items;
                    if (data.Status === 200) {
                        var attrMinimum = getAttribute(traits, 'TraitName', 'LimitMinimum');
                        var attrMaximum = getAttribute(traits, 'TraitName', 'LimitMaximum');
                        if (attrMinimum && attrMaximum) {
                            settings.minimumUrl = attrMinimum.Links.Value;
                            settings.maximumUrl = attrMaximum.Links.Value;
                        }
                        else {
                            settings.minimumUrl = 'N/A';
                            settings.maximumUrl = 'N/A';
                        }
                    }
                    else {
                        logError(data.Content);
                    }
                }

                data = responseData[settings.index + ':point'];
                if (data) {
                    var points = data.Content.Items;
                    if (data.Status !== 200) {
                        var webIdData = responseData[settings.index + ':webid'];
                        if (webIdData && webIdData.Status === 200) {
                            if (getAttribute(webIdData.Content, 'DataReferencePlugIn', 'PI Point')) {
                                logError(data.Content); // PI tag should exist
                            }
                            else {
                                // remove benign error messages logged by the data pump
                                var message = new RegExp(scope.symbol.Name + '_' + settings.index + ':webid\.Content\.Links\.Point\.' + "$");
                                log.remove('PI Web API Error', message);
                                message = new RegExp(scope.symbol.Name + '_' + settings.index + ':point\.$');
                                log.remove('PI Web API Error', message);

                                settings.zero = 'N/A';
                                settings.span = 'N/A';
                                settings.displayDigits = 'N/A';
                            }
                        }
                    }
                }

                data = responseData[settings.index + ':attr'];
                if (data) {
                    var attributes = data.Content.Items;
                    if (data.Status === 200) {
                        var attrZero = getAttribute(attributes, 'Name', 'zero');
                        var attrSpan = getAttribute(attributes, 'Name', 'span');
                        var attrDisplayDigits = getAttribute(attributes, 'Name', 'displaydigits');
                        if (attrZero && attrSpan && attrDisplayDigits) {
                            settings.zero = attrZero.Value;
                            settings.span = attrSpan.Value;
                            settings.displayDigits = attrDisplayDigits.Value;
                        }
                    }
                    else if (responseData[settings.index + ':point']) {
                        if (responseData[settings.index + ':point'].Status === 200) {
                            logError(data.Content); // AF attribute's pi tag should have attributes
                        }   
                    }
                    else {
                        logError(data.Content);
                    }
                }
            };

            var clearStoredUOMs = Object.keys(responseData).reduce(function (hasWebId, response) {
                return hasWebId || (response.indexOf('webid') > -1);
            }, false);

            if (clearStoredUOMs) {
                runtimeData.uomList = [];
            }

            seriesList.forEach(function (series, index) {
                update(series.x, index, 'x');
                update(series.y, index, 'y');
            });
        }
        
        function processResults(data) {
            var refresh = false;
            var seriesList = getSeriesList();

            // in case datapump and datasource change is not in sync
            if (!data[seriesList.length - 1 + ':X']) {
                return;
            }

            // need all traits before the next loop. 
            if (scope.config.ScaleFormat === 'database') {
                seriesList.forEach(function (series, index) {
                    series.afTraits = {
                        XMinimum: data[index + ':X:Minimum'],
                        XMaximum: data[index + ':X:Maximum'],
                        YMinimum: data[index + ':Y:Minimum'],
                        YMaximum: data[index + ':Y:Maximum']
                    }
                });
            }

            seriesList.forEach(function (series, index) {
                var xData = { Items: [] };
                var yData = { Items: [] };
                var synchronizedCalled = false;

                if (data[index + ':X'].Status == 200) {
                    xData = data[index + ':X'].Content;
                    if (checkQueryLimit(series.x.queryMethod, xData)) {
                        suspendSeries(seriesList, index, 'x');
                    }
                    else {
                        if (xData.UnitsAbbreviation) {
                            if (!runtimeData.uomList[index]) {
                                runtimeData.uomList[index] = {};
                            }

                            runtimeData.uomList[index].x = xData.UnitsAbbreviation;
                        }

                        if (series.y.queryMethod === 'synchronize') {
                            if (checkQueryLimit(series.y.queryMethod, xData)) {
                                yData = { Items: [] };
                                suspendSeries(seriesList, index, 'y');
                            }
                            else {
                                // ideally, should return yData?
                                getSynchronizedData(xData, seriesList, index);
                                synchronizedCalled = true;
                            }
                        }
                        else {                            
                            
                            if (data[index + ':Y'].Status == 200) {
                                yData = data[index + ':Y'].Content;

                                if (checkQueryLimit(series.y.queryMethod, yData)) {
                                    yData = { Items: [] };
                                    suspendSeries(seriesList, index, 'y');
                                }
                                else {
                                    if (yData.UnitsAbbreviation) {
                                        if (!runtimeData.uomList[index]) {
                                            runtimeData.uomList[index] = {};
                                        }

                                        runtimeData.uomList[index].y = yData.UnitsAbbreviation;
                                    }

                                    if (series.x.queryMethod === 'snapshot') {
                                        xData = { Items: [xData] };
                                        yData = { Items: [yData] };
                                    }
                                    refresh = true;
                                }
                            }
                            else {
                                yData = { Items: [] };
                                logError(data[index + ':Y'].Content);
                                clearChartSeriesData(index);
                                refresh = true;
                            }                                                       
                        }
                    }
                }
                else {
                    logError(data[index + ':X'].Content);
                    clearChartSeriesData(index);
                    refresh = true;                    
                }

                if (synchronizedCalled === false) {
                    matchSeriesData(xData, yData, series.joinType, seriesList, index);                    
                }                
            });

            runtimeData.syncTime = runtimeData.syncTime || timeProvider.getServerStartTime();   // set after data parsing
            setAxisLabels(seriesList);
            isUpdating = false;

            if (refresh) {
                refreshChart();
            }
        }

        function setAxisLabels(seriesList) {
            chart.options.xAxis.title.text = getChartAxisTitle(seriesList, true);

            var yAxisTitle = !chart.options.yAxis.length ? chart.options.yAxis.title : chart.options.yAxis[chart.options.yAxis.length - 1].title;
            yAxisTitle.text = getChartAxisTitle(seriesList, false);
        }

        function getSynchronizedData(xData, seriesList, index) {
            var yData = { Items: [] };
            if (xData.Items && xData.Items.length > 0) {
                var series = seriesList[index];
                var urls = PV.xyData.getSynchronizeUrls(series.y.webId, xData.Items.map(function (item) { return item.Timestamp; } ));
                var batchObj = {};
                urls.forEach(function (url, urlIndex) {
                    batchObj[index + ':Y:' + urlIndex] = { Method: 'GET', Resource: url };
                });

                PV.xyData.batchExecute(batchObj, function (response) {
                    var data = response.data;
                    if (data[index + ':Y:0'].Status == 200) {
                        yData = data[index + ':Y:0'].Content

                        var i = 1;
                        while (true) {
                            if (data.hasOwnProperty(index + ':Y:' + i)) {
                                if (data[index + ':Y:' + i].Status == 200) {
                                    yData.Items = yData.Items.concat(data[index + ':Y:' + i].Content.Items);
                                    i++;
                                    continue;
                                }
                                else {
                                    yData = null;                                    
                                    logError(data[index + ':Y:' + i].Content);
                                    clearChartSeriesData(index, true);
                                }
                            }

                            break;
                        }
                        if (yData) {
                            if (yData.UnitsAbbreviation) {
                                if (!runtimeData.uomList[index]) {
                                    runtimeData.uomList[index] = {};
                                }
                                
                                runtimeData.uomList[index].y = yData.UnitsAbbreviation;
                            }                            
                        }
                    }
                    else {
                        logError(data[index + ':Y:0'].Content);
                        clearChartSeriesData(index, true);
                    }

                    if (yData !== null) {
                        matchSeriesData(xData, yData, series.joinType, seriesList, index);
                    }
                    
                    setAxisLabels(seriesList);
                    refreshChart();
                }, logError);
            }
            else {
                clearChartSeriesData(index, true);
                refreshChart();                
            }
        }

        function getTimeStringFromInterval(interval, intervalType) {
            var timeInterval = interval || 1;
            var timePeriod = intervalType || 'h';

            if (timePeriod === 'y') {
                return ((timeInterval * 12) + 'mo');
            }

            return timeInterval + timePeriod;
        }

        // infer the chart Axis Label from distinct of all series labels.        
        function getChartAxisTitle(seriesList, isX) {            

            if (isX) {
                if (scope.config.XAxisLabelType === 'customlabel') {
                    return scope.config.XAxisCustomLabel;
                }
            }
            else {
                if (scope.config.YAxisLabelType === 'customlabel') {
                    return scope.config.YAxisCustomLabel;
                }
            }

            var axisLabelList = [];
            if (seriesList) {
                seriesList.forEach(function (series, index) {
                    var datasource = isX ? series.x : series.y;
                    if (datasource) {
                        var uom;
                        if (runtimeData.uomList[index]) {
                            uom = (isX) ? runtimeData.uomList[index].x : runtimeData.uomList[index].y;
                        }

                        var uomLabel = (scope.config.ShowEngineeringUnits === true && uom) ? ' (' + uom + ')' : '';
                        var label = datasource.axisLabel + uomLabel;
                        if (axisLabelList.indexOf(label) === -1) {
                            axisLabelList.push(label);
                        }
                    }
                });

                if (axisLabelList && axisLabelList.length === 1) {
                    return axisLabelList[0];
                }
            }
            
            return '';
        }

        function getDisplayLegend(options) {
            var dataSourceLabel = options.dataSourceLabel;
            var dataSourcePath = options.dataSourcePath;
            var isAF = options.isAF;
            var selectedLegend = options.legendType || 'sourcedata';
            var displayTitle = options.seriesTitle || '';
            var showEngineeringUnits = options.showEngineeringUnits;
            var uomLabel = (showEngineeringUnits === true && options.uom) ? ' (' + options.uom + ')' : '';
            var showCorrelationCoefficient = (options.showCorrelationCoefficient === true);
            var correlationCoefficient = options.correlationCoefficient;
            var correlationCoefficientLabel = (showCorrelationCoefficient && correlationCoefficient) ? '\n\u03c1 ' + correlationCoefficient.toFixed(5) : '';

            if (selectedLegend === 'customlabel') {
                return (displayTitle) ? displayTitle + correlationCoefficientLabel : displayTitle + correlationCoefficientLabel.substr(1);
            }
            else if (isAF && selectedLegend === 'assetonly' && dataSourcePath) {
                return (dataSourcePath).slice(dataSourcePath.lastIndexOf('\\') + 1).split('|')[0] + correlationCoefficientLabel;
            }
            return dataSourceLabel + uomLabel + correlationCoefficientLabel;
        }

        function isAF(index) {
            var dataSource = scope.symbol.DataSources[index];
            if (dataSource) {
                return dataSource.substr(0, 3) === 'af:';
            }
        }

        function getCustomScale() {
            var xMin = Number(scope.config.XScaleMin);
            var xMax = Number(scope.config.XScaleMax);
            var yMin = Number(scope.config.YScaleMin);
            var yMax = Number(scope.config.YScaleMax);

            return { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };
        }

        function logError(error, sever, clear) {
            var message = PV.ResourceStrings.XYPlotErrorUndefined;
            var severity = sever ? sever : log.Severity.Error;
            var clearType = clear ? clear : log.ClearType.DataUpdate;

            if (error) {
                if (error.status) {
                    message = error.status + ' ' + error.statusText;
                    error = (error.responseJSON) ? error.responseJSON : error;
                }

                if (error.Errors) {
                    message = '';
                    error.Errors.forEach(function (err, i) {
                        message += (i > 0) ? '; ' + err : err;
                    });
                }
            }

            log.add(PV.ResourceStrings.XYPlotError, severity, message, clearType);
        }

        // check if a query has/will return too many results
        function checkQueryLimit(queryMethod, data) {
            // snapshot always passes, ignore interpolated
            if (queryMethod === 'recorded' && data) { // post query check
                return (data.Items.length >= PV.xyData.getMaxRecordedCountLimit());
            }
            if (queryMethod === 'synchronize' && data) { // pre query check
                return (data.Items.length >= PV.xyData.getMaxSynchronizedCountLimit());
            }

            return false;
        }

        function suspendSeries(seriesList, index, component) {
            var series = seriesList[index];
            var limit;
            if (series[component].queryMethod === 'recorded') {
                limit = '' + PV.xyData.getMaxRecordedCountLimit();
            }
            else if (series[component].queryMethod === 'synchronize') {
                limit = '' + PV.xyData.getMaxSynchronizedCountLimit();
            }

            var stringFormat = window.PIVisualization.stringFormat;
            var errorMessage = stringFormat(PV.ResourceStrings.XYPlotQueryLimitError, series[component].label, '(' + series.x.label + ', ' + series.y.label + ')', limit);
            if (scope.symbol.Configuration.Title) {
                errorMessage = scope.symbol.Configuration.Title + ': ' + errorMessage;
            }

            series.suspended = true;
            series.suspendStartTime = Date.now();
            logError({ Errors: [errorMessage] }, null, log.ClearType.Manual);
            clearSeriesListData(seriesList, index);
            clearChartSeriesData(index, true);
            refreshChart();
        }
        
        function resumeSeries(seriesList, index, resumeAll) {
            if (!resumeAll) {
                seriesList[index].suspended = false;
            }
            else {
                seriesList.forEach(function (series) {
                    series.suspended = false;
                });
            }
            log.clear();
        }

        function getChartScale(index) {
            var xmin = chart.options.xAxis.min;
            var xmax = chart.options.xAxis.max;
            var yAxisOptions = chart.options.yAxis;
            var ymin = (Array.isArray(yAxisOptions) && index < yAxisOptions.length) ? yAxisOptions[index].min : yAxisOptions.min;
            var ymax = (Array.isArray(yAxisOptions) && index < yAxisOptions.length) ? yAxisOptions[index].max : yAxisOptions.max;
            return { xMin: xmin, xMax: xmax, yMin: ymin, yMax: ymax };
        }

        function getTooltip(e) {
            var i;

            if (!scope.layoutMode && !isZooming && !isUpdating) {
                var seriesList = getSeriesList();
                pauseUpdates();

                var seriesId = e.series.id.toString().split(':');
                var currentSeries = seriesList[seriesId[0]];

                var xTime, yTime, xValue, yValue;
                var seriesTooltips = Array(seriesList.length);

                //find the position of the point in the plot area
                var currentscale = getChartScale(seriesId[0]);
                var plotPosition = getXYPosition(currentscale, e.value.x, e.value.y);

                for (i = 0; i < seriesList.length; i++) {
                    if (seriesList[i].data && chart.options.series[i].visible) {
                        var scale = getChartScale(i);
                        seriesTooltips[i] = buildSeriesTooltips(seriesList[i], scale, plotPosition, runtimeData.uomList[i]);
                    }
                    else {
                        seriesTooltips[i] = [];
                    }
                }

                var tooltips = [];
                var tooltipText = '';
                var seriesCount = 0;
                var tooltipCount = 0;
                for (i = 0; i < seriesTooltips.length; i++) {
                    if (seriesTooltips[i] && seriesTooltips[i].length > 0) {
                        seriesCount++;
                        tooltipCount += seriesTooltips[i].length;
                        for (var j = 0; j < Math.min(seriesTooltips[i].length, tooltipMax) ; j++) {
                            if (tooltips.length < tooltipMax) {
                                tooltips.push(seriesTooltips[i][j]);
                            }
                        }
                    }
                }

                if (tooltips.length > 0) {
                    for (i = 0; i < Math.min(tooltips.length, tooltipMax) ; i++) {
                        tooltipText += (i > 0) ? '<br/><br/>' : '';
                        tooltipText += tooltips[i];
                    }

                    var backgroundColor = currentSeries.color;
                    var textColor = '#ffffff';  // white

                    if (seriesCount > 1) {
                        backgroundColor = '#c0c0c0';
                    }

                    if (tooltipCount > tooltipMax) {
                        tooltipText += '<br/>...';
                    }
                    var luma = colorBrightness(backgroundColor);
                    if (luma > 186) {   // 186 from stackoverflow.com/questions/946544
                        textColor = '#000000';  // black
                    }
                    return '<div style="text-align:left; padding: 6px; border-radius: 4px; background:' + backgroundColor + '; color:' + textColor + '">' + tooltipText + '</div>';
                }
            }

            return '';
        }

        function colorBrightness(color) {
            var c = color.substring(1); // remove leading "#" character
            var rgb = parseInt(c, 16);  // convert rrggbb hex to decimal
            var r = (rgb >> 16) & 0xff; // extract red
            var g = (rgb >>  8) & 0xff; // extract green
            var b = (rgb >>  0) & 0xff; // extract blue

            var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709
            return luma;
        }

        function buildSeriesTooltips(series, scale, plot, uoms) {
            var tooltips = [];
            var processPoints = function (scale, points, map, uoms) {
                var point;
                for (var i = 0; i < points.length; i++) {
                    if (tooltips.length > tooltipMax) {
                        break;
                    }

                    point = getXYPosition(scale, points[i][0], points[i][1]);
                    if (point.x === plot.x && point.y === plot.y) {
                        tooltips.push(buildTooltip(series,
                                    series.data.xData.Items[map[i][0]],
                                    series.data.yData.Items[map[i][1]], uoms));
                    }
                }
            };

            processPoints(scale, series.data.pointData, series.data.pointMap, uoms);
            processPoints(scale, series.data.errorData, series.data.errorMap, uoms);

            return tooltips;
        }

        function getXYPosition(scale, x, y) {
            //find the relative position of the point
            var xPos, yPos;
            if (scale) {
                xPos = (x === PV.xyPairData.errorValue) ? 0 : Math.round(((x - scale.xMin) / (scale.xMax - scale.xMin)) * 100);
                yPos = (y === PV.xyPairData.errorValue) ? 0 : Math.round(((y - scale.yMin) / (scale.yMax - scale.yMin)) * 100);
            }

            return { x: xPos, y: yPos };
        }

        function buildTooltip(series, xPoint, yPoint, uoms) {
            var xTime = new Date(xPoint.Timestamp).toLocaleString();
            var yTime = new Date(yPoint.Timestamp).toLocaleString();
            var config = scope.config;
            var xValue, yValue, options;
            yValue = '';
            var xuom = '';
            var yuom = '';
            if (xPoint.Good) {
                options = getNumberFormatOptions(series.x);
                xValue = PV.xyFormat.format(xPoint.Value, options.format, options);
                xuom = (uoms && uoms.x) ? ' (' + PV.Utils.escapeHtml(uoms.x) + ')' : '';
            }
            else {
                if (xPoint.Value) {
                    xValue = xPoint.Value.Name;
                }
            }
            if (yPoint.Good) {
                options = getNumberFormatOptions(series.y);
                yValue = PV.xyFormat.format(yPoint.Value, options.format, options);
                yuom = (uoms && uoms.y) ? ' (' + PV.Utils.escapeHtml(uoms.y) + ')' : '';
            }
            else {
                if (yPoint.Value) {
                    yValue = yPoint.Value.Name;
                }
            }

            var text =
                '<b>X: </b>' + PV.Utils.escapeHtml(series.x.path) + '<br/>' +
                xTime + ' : ' + PV.Utils.escapeHtml(xValue) + xuom + '<br/>' +
                '<b>Y: </b>' + PV.Utils.escapeHtml(series.y.path) + '<br/>' +
                yTime + ' : ' + PV.Utils.escapeHtml(yValue) + yuom;

            return text;
        }

        function getNumberFormatOptions(settings) {
            
            var config = scope.config;
            var dataSettings = (config.DataSettings) ? config.DataSettings[settings.index] : null;
            var options = { displaydigits: settings.displayDigits};
            if (dataSettings && dataSettings.NumberFormat) { // data source specific settings
                options.format = dataSettings.NumberFormat;
                options.decimals = (isNaN(dataSettings.NumberDecimals)) ? 2 : dataSettings.NumberDecimals;
                options.thousands = (dataSettings.NumberThousands !== false);
            }
            else {
                options.format = config.NumberFormat;
                options.decimals = config.NumberDecimals;
                options.thousands = config.NumberThousands;
            }

            return options;
        }
        
        function markerVisual(e) {
            var markerColor = e.series.color;
            var endingMarkerColor = e.series.color;
            var endingMarkers = 1;
            var style = '';
            if (!isNaN(e.series.id)) {
                var series = runtimeData.seriesList[e.series.id];
                endingMarkerColor = series.endingMarkerColor;
                if (!isNaN(series.endingMarkers)) {
                    endingMarkers = parseInt(series.endingMarkers);
                }                
                style = series.markerStyle || PV.XYPlotConfig.configure.markerStyles[e.series.id % 11];
            }

            var seriesCheckLength = (e.series.data) ? e.series.data.length -1 : 0;
            for (var i = 0; i < endingMarkers; i++) {
                var markerPosition = e.series.data[seriesCheckLength -i];
                if ((markerPosition && e.value.x === markerPosition[0] && e.value.y === markerPosition[1])) {
                    return drawMarker(style, endingMarkerColor, e.rect);
                }
            }

            return drawMarker(style, markerColor, e.rect);
        }

        function getMarkers(series, index) {
            var style = series.markerStyle || PV.XYPlotConfig.configure.markerStyles[index % 11];

            switch (style) {
                case 'circle_solid':
                    return {
                        type: 'circle',
                        background: series.color,
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    };
                case 'circle_hollow':
                    return {
                        type: 'circle',
                        background: 'transparent',
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    };
                case 'diamond_solid':
                    return {
                        type: 'square',
                        background: series.color,
                        rotation: 45,
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'diamond_hollow':
                    return {
                        type: 'square',
                        rotation: 45,
                        background: 'transparent',
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'square_solid':
                    return {
                        type: 'square',
                        background: series.color,
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'square_hollow':
                    return {
                        type: 'square',
                        background: 'transparent',
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'triangle_solid':
                    return {
                        type: 'triangle',
                        background: series.color,
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'triangle_hollow':
                    return {
                        type: 'triangle',
                        background: 'transparent',
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'triangle_down_solid':
                    return {
                        type: 'triangle',
                        rotation: 180,
                        background: series.color,
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'triangle_down_hollow':
                    return {
                        type: 'triangle',
                        rotation: 180,
                        background: 'transparent',
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                case 'cross':
                    return {
                        type: 'cross',
                        rotation: 45,
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    }
                default:
                    return {
                        type: 'circle',
                        background: series.color,
                        visual: markerVisual,
                        visible: series.showMarkers                        
                    };
            }
        }

        function drawMarker(style, color, rect) {                                
            var center = rect.center();
            var origin = rect.origin;
            var bottomRight = rect.bottomRight();

            var geometry;

            switch (style) {
                case 'circle_solid':
                    geometry = new kendo.geometry.Circle(center, 4);
                    return new kendo.drawing.Circle(geometry, {
                        stroke: {
                            color: color,
                            width: 2
                        },
                        fill: {
                            color: color
                        }
                    });
                case 'circle_hollow':
                    geometry = new kendo.geometry.Circle(center, 4);
                    return new kendo.drawing.Circle(geometry, {
                        stroke: {
                            color: color,
                            width: 2
                        },
                        fill: {
                            color: color,
                            opacity: 0                            
                        }
                    });
                    return shape;
                case 'diamond_solid':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(center.x, origin.y)
                    .lineTo(bottomRight.x, center.y)
                    .lineTo(center.x, bottomRight.y)
                    .lineTo(origin.x, center.y)
                    .close();
                case 'diamond_hollow':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color,
                            opacity: 0
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(center.x, origin.y)
                    .lineTo(bottomRight.x, center.y)
                    .lineTo(center.x, bottomRight.y)
                    .lineTo(origin.x, center.y)
                    .close();
                case 'square_solid':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(origin.x, origin.y)
                    .lineTo(origin.x, bottomRight.y)
                    .lineTo(bottomRight.x, bottomRight.y)
                    .lineTo(bottomRight.x, origin.y)
                    .close();
                case 'square_hollow':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color,
                            opacity: 0
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(origin.x, origin.y)
                    .lineTo(origin.x, bottomRight.y)
                    .lineTo(bottomRight.x, bottomRight.y)
                    .lineTo(bottomRight.x, origin.y)
                    .close();
                case 'triangle_solid':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(origin.x, bottomRight.y)
                    .lineTo(bottomRight.x, bottomRight.y)
                    .lineTo(center.x, origin.y)
                    .close();
                case 'triangle_hollow':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color,
                            opacity: 0
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(origin.x, bottomRight.y)
                    .lineTo(bottomRight.x, bottomRight.y)
                    .lineTo(center.x, origin.y)
                    .close();
                case 'triangle_down_solid':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(origin.x, origin.y)
                    .lineTo(bottomRight.x, origin.y)
                    .lineTo(center.x, bottomRight.y)
                    .close();
                case 'triangle_down_hollow':
                    return new kendo.drawing.Path({
                        fill: {
                            color: color,
                            opacity: 0
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(origin.x, origin.y)
                    .lineTo(bottomRight.x, origin.y)
                    .lineTo(center.x, bottomRight.y)
                    .close();
                case 'cross':
                    return new kendo.drawing.MultiPath({
                        fill: {
                            color: 'transparent'
                        },
                        stroke: {
                            color: color,
                            width: 2
                        }
                    })
                    .moveTo(center.x, origin.y)
                    .lineTo(center.x, bottomRight.y)
                    .moveTo(origin.x, center.y)
                    .lineTo(bottomRight.x, center.y);
                default:
                    geometry = new kendo.geometry.Circle(center, 4);
                    return new kendo.drawing.Circle(geometry, {
                        stroke: {
                            color: 'transparent'
                        },
                        fill: {
                            color: 'transparent'
                        }
                    });
            }
        }                

        // Called by symbol host when this.scope is destroyed
        function destroy() {
            this.timeProvider.onDisplayTimeChanged.unsubscribe(this.onDisplayTimeChanged);
        }
    };

    function getCustomQueries(symbol, displayStartTime, displayEndTime, runtimeData) {
        if (!runtimeData.seriesList) {
            runtimeData.seriesList = PV.XYPlotConfig.configure.createSeriesList(symbol.Configuration, symbol.DataSources);
        }

        return PV.xyData.getBatchQueries(symbol, runtimeData.seriesList, displayStartTime, displayEndTime, null, runtimeData.syncTime);
    }

    var def = {
        typeName: 'xyplot',
        displayName: PV.ResourceStrings.XYPlotSymbol,                     
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: 'Images/chrome.xyplot.svg',
        getDefaultConfig: function () {
            var config = PV.SymValueLabelOptions.getDefaultConfig({
                DataShape: 'Custom',
                Height: 250,
                Width: 600,
                BackgroundColor: 'transparent',
                ShowTitle: false,
                Title: '',
                TitlePosition: 'top',
                TitleColor: 'white',
                ShowXAxisLabel: true,
                XAxisLabelType: 'sourcedata',
                XAxisCustomLabel: '',
                ShowYAxisLabel: true,
                YAxisLabelType: 'sourcedata',
                YAxisCustomLabel: '',
                ShowEngineeringUnits: true,
                ShowGrid: true,
                GridColor: 'white',
                ShowLegend: true,
                LegendPosition: 'right',
                LegendColor: 'white',
                ScaleColor: 'white',
                ScaleFormat: 'autorange',
                NumberFormat: 'Database',
                NumberDecimals: 2,
                NumberThousands: true,
                ShowLine: false,
                XScaleMin: 0,
                XScaleMax: 100,
                YScaleMin: 0,
                YScaleMax: 100,
                DataSettings: [],
                zoomToggle: false
            });
            return config;
        },
        templateUrl: 'scripts/app/editor/symbols/sym-xyplot-template.html',
        visObjectType: xyPlotVis,
        themes: {
            reverse: {
                TitleColor: 'black',
                LegendColor: 'black',
                ScaleColor: 'black'
            }
        },
        configTemplateUrl: 'scripts/app/editor/symbols/sym-xyplot-config.html',
        configTitle: PV.ResourceStrings.ConfigureXYPlotOption,
        configInit: PV.XYPlotConfig.init,
        configure: PV.XYPlotConfig.configure,
        dataSourcesAdded: PV.XYPlotConfig.configure.addDataSources,
        openConfigPane: PV.XYPlotConfig.openConfigPane,
        getCustomQueries: getCustomQueries,
        inject: ['$timeout', '$sanitize', 'timeProvider', 'dateTimeFormatter', 'webServices', 'touchDetection', 'displayProvider', 'dataPump', 'log']
    };

    PV.symbolCatalog.register(def);

})(window.PIVisualization);