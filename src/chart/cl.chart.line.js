'use strict'

// //////////////////////////////////////////////////
// 以下是ClChartLine的实体定义  --- 画线类
// //////////////////////////////////////////////////
// 实际上就是获取某种类型数据，然后横坐标 0 开始排序，永远是数值型，但显示出什么要到对应的数组中找
// 纵坐标根据数据类型，计算最大最小值，然后根据画线类型画出数据线，所有的不同全部在ClChart中处理
// //////////////////////////////////////////////////

import {
  _fillRect,
  _getImageData,
  _putImageData,
  _setLineWidth,
  _getTxtWidth,
  _drawBegin,
  _drawEnd,
} from '../util/cl.draw';
import {
  fromIndexToTradeTime,
  getMinuteCount
} from '../data/cl.data.tools';
import {
  findLabelToIndex,
  setFixedLineFlags,
  setMoveLineFlags,
} from './cl.chart.tools';
import {
  initCommonInfo,
  checkLayout,
  CFG_LAYOUT
} from '../cl.chart';
import {
  updateJsonOfDeep,
  copyJsonOfDeep,
  offsetRect,
  inArray,
  isEmptyArray,
  formatShowTime,
  inRangeX,
} from '../util/cl.tool';

import { STOCK_TYPE_INDEX } from '../data/cl.data.const';
import getValue, { getSize } from '../data/cl.data.tools';

import ClChartButton from './cl.chart.button';
import ClChartScroll from './cl.chart.scroll';
import ClDrawAxisX from './cl.draw.axisX';
import ClDrawAxisY from './cl.draw.axisY';
import ClDrawCursor from './cl.draw.cursor';
import ClDrawGrid from './cl.draw.grid';
import ClDrawInfo from './cl.draw.info';
import ClDrawLine from './cl.draw.line';
import ClDrawVLine from './cl.draw.vline';

export default function ClChartLine(father) {
  initCommonInfo(this, father);

  this.linkInfo = father.linkInfo;
  this.static = this.father.datalayer.static;
  // ////////////////////////////////////////////////////////////////
  //   程序入口程序，以下都是属于设置类函数，基本不需要修改，
  // ///////////////////////////////////////////////////////////////
  this.init = function(cfg, callback) {
    this.callback = callback;
    this.rectMain = cfg.rectMain || { left: 0, top: 0, width: 400, height: 200 };
    this.layout = updateJsonOfDeep(cfg.layout, CFG_LAYOUT);
    this.config = copyJsonOfDeep(cfg.config);
    // 这里直接赋值是因为外部已经设置好了配置才会开始初始化
    this.buttons = cfg.buttons || [];
    this.scroll = cfg.scroll || { display: 'none', size: 0 };
    this.childCharts = {};

    // 下面对配置做一定的校验
    this.checkConfig();
    // 再做一些初始化运算，下面的运算范围是初始化设置后基本不变的数据
    this.setPublicRect();
    // 初始化子窗口
    this.childDraws = {};
    this.setChildDraw();
    this.childLines = {};
    this.setChildLines();
    // 初始化按钮
    this.setButtons();
    // 初始化滚动条
    this.setScroll();
  }
  this.checkConfig = function() { // 检查配置有冲突的修正过来
    checkLayout(this.layout);
    this.config.axisX.width *= this.scale;
    this.scroll.size *= this.scale;
    this.maxmin = {};
    this.data = {};
  }
  this.setPublicRect = function() { // 计算所有矩形区域
  // rectChart 画图区
  // rectTitle rectMess
  // rectAxisX
  // rectScroll
  // rectAxisYLeft rectAxisYRight
  // rectGridLine 坐标线区域

    this.rectChart = offsetRect(this.rectMain, this.layout.margin);
    const axisInfo = { width: this.config.axisX.width }; //

    // 计算title和mess矩形位置
    this.rectTitle = { left: 0, top: 0, width: 0, height: 0 };
    this.rectMess = { left: 0, top: 0, width: 0, height: 0 };
    if (this.config.title.display !== 'none') {
      this.rectTitle = {
        left: this.rectChart.left,
        top: this.rectChart.top,
        width: axisInfo.width,
        height: this.layout.text.height
      };
      this.rectMess = {
        left: this.rectChart.left + axisInfo.width + this.scale,
        top: this.rectChart.top,
        width: this.rectChart.width - axisInfo.width * 2,
        height: this.layout.text.height
      };
    }

    // 计算rectAxisX和rectScroll矩形位置
    axisInfo.left = this.rectChart.left;
    axisInfo.right = this.rectChart.left + this.rectChart.width;
    axisInfo.top = this.rectTitle.top + this.rectTitle.height;
    axisInfo.bottom = this.rectChart.top + this.rectChart.height;

    if (this.axisPlatform !== 'phone') {
      if (this.config.axisY.left.display !== 'none') axisInfo.left += this.config.axisX.width;
      if (this.config.axisY.right.display !== 'none') axisInfo.right -= this.config.axisX.width;
    }
    if (this.config.axisX.display !== 'none') {
      axisInfo.bottom -= this.layout.text.height;
    }
    if (this.scroll.display !== 'none') {
      axisInfo.bottom -= this.scroll.size;
    }
    // 此时已经可以得出画坐标线的区域了
    this.rectGridLine = {
      left: axisInfo.left,
      top: axisInfo.top,
      width: axisInfo.right - axisInfo.left,
      height: axisInfo.bottom - axisInfo.top
    };
    this.rectAxisYLeft = {
      left: this.rectChart.left,
      top: axisInfo.top,
      width: axisInfo.width,
      height: axisInfo.bottom - axisInfo.top
    };
    this.rectAxisYRight = {
      left: this.rectChart.left + this.rectChart.width - axisInfo.width,
      top: axisInfo.top,
      width: axisInfo.width,
      height: axisInfo.bottom - axisInfo.top
    };
    this.rectChart = offsetRect(this.rectGridLine, this.layout.offset);
    this.rectAxisX = { left: 0, top: axisInfo.bottom, width: 0, height: 0 };
    if (this.config.axisX.display !== 'none') {
      this.rectAxisX = {
        left: axisInfo.left,
        top: axisInfo.bottom + this.scale,
        width: axisInfo.right - axisInfo.left,
        height: this.layout.text.height
      };
    }
    if (this.scroll.display !== 'none') {
      this.rectScroll = {
        left: axisInfo.left,
        top: this.rectAxisX.top + this.rectAxisX.height + this.scale,
        width: axisInfo.right - axisInfo.left,
        height: this.scroll.size
      };
    }
  }
  this.getLineDataKey = function (line) {
    if (line.formula === undefined) return this.hotKey;
    return line.formula.key;
  }
  this.setChildLines = function () {
    // l_kbar，l_line，l_nowvol，l_vbar l_nowline
    let line;
    for (let i = 0; i < this.config.lines.length; i++) {
      const className = this.config.lines[i].className;
      line = new className(this, this.rectChart); 

      this.childLines['NAME' + i] = line;
      line.hotKey = this.getLineDataKey(this.config.lines[i]);
      if (inArray(className, [ClDrawLine, ClDrawVLine])) {
        line.out = { labelX: 'idx', labelY: 'value' };
        if (this.config.lines[i].out !== undefined) line.out = this.config.lines[i].out;
      }
    }
  }
  this.setChildDraw = function () {
    let draw;
    if (this.config.title.display !== 'none') {
      draw = new ClDrawCursor(this, this.rectGridLine, this.rectChart);
      this.childDraws['CURSOR'] = draw;
      draw = new ClDrawInfo(this, this.rectTitle, this.rectMess);
      this.childDraws['TITLE'] = draw;
    }
    if (this.config.axisY.left.display !== 'none') {
      draw = new ClDrawAxisY(this, this.rectAxisYLeft, 'left');
      this.childDraws['AXISY_LEFT'] = draw;
    }
    if (this.config.axisY.right.display !== 'none') {
      draw = new ClDrawAxisY(this, this.rectAxisYRight, 'right');
      this.childDraws['AXISY_RIGHT'] = draw;
    }
    if (this.config.axisX.display !== 'none') {
      draw = new ClDrawAxisX(this, this.rectAxisX);
      this.childDraws['AXISX'] = draw;
    }
    draw = new ClDrawGrid(this, this.rectGridLine);
    this.childDraws['GRID'] = draw;
    // 下面是line的定义
  }
  this.setScroll = function() {
    if (this.scroll.display === 'none') return;
    const chart = new ClChartScroll(this);
    chart.name = 'HSCROLL';
    // this.father.bindEvent(chart);
    this.childCharts[chart.name] = chart;

    chart.init({ rectMain: this.rectScroll, config: { width: 8 } },
      result => {
        const self = result.self.father;
        if (self.father.linkInfo.minIndex !== result.minIndex) {
          self.father.linkInfo.minIndex = result.minIndex;
          self.father.onPaint();
        }
      });
  }
  this.createButton = function(name) {
    if (this.childCharts[name] !== undefined) return this.childCharts[name];
    const chart = new ClChartButton(this);
    chart.name = name;
    // this.father.bindEvent(chart);
    this.childCharts[name] = chart;
    return chart;
  }
  this.setButtons = function() {
    let chart;
    let xx, yy;
    let ww = 25 * this.scale;
    if (inArray('zoomin', this.buttons) || inArray('zoomout', this.buttons)) {
      chart = this.createButton('zoomin');
      xx = Math.floor((this.rectChart.width - (ww + ww) * 2) / 4);
      yy = this.rectChart.top + this.rectChart.height * 0.98 - ww;
      chart.init({
        rectMain: { left: xx, top: yy, width: ww, height: ww },
        info: [{ map: '-' }]
      },
        result => {
          const self = result.self.father;
          if (self.zoomInfo.index > 0) {
            self.zoomInfo.index--;
            self.setZoomInfo(self.zoomInfo.index);
            self.father.onPaint();
          }
        });
      chart = this.createButton('zoomout');
      xx += 2 * ww;
      chart.init({
        rectMain: { left: xx, top: yy, width: ww, height: ww },
        info: [{ map: '+' }]
      },
        result => {
          const self = result.self.father;
          if (self.zoomInfo.index < self.zoomInfo.list.length - 1) {
            self.zoomInfo.index++;
            self.setZoomInfo(self.zoomInfo.index);
            self.father.onPaint();
          }
        });
    }
    if (inArray('exright', this.button)) {
      chart = this.createButton('exright');
      ww = _getTxtWidth(this.context, '前复权', this.layout.text.font, this.layout.text.pixel - 2 * this.scale);
      xx = this.rectMain.width - ww - 6 * this.scale;
      chart.init({
        rectMain: {
          left: xx,
          top: this.rectMess.top + this.scale,
          width: ww + 4 * this.scale,
          height: this.rectMess.height - 2 * this.scale
        },
        config: { box: 'box' },
        info: [
          { map: '不除权', value: 'no' },
          { map: '前复权', value: 'forword' }
          // , {
          //   map: '后复权',
          //   value: 'back'
          // }
        ]
      },
        result => {
          const self = result.self.father;
          self.father.linkInfo.rightMode = result.info.value;
          self.father.onPaint();
        });
      chart.hotIdx = 0;
    }
  }
  // //////////////////////////////////////
  // 下面开始是功能性函数 主要用于简化主函数的结构
  // //////////////////////////////////////
  this.getDecimal = function (label) {
    if (label === 'vol' || label === 'decvol') return 0;
    return this.static.decimal;
  }
  this.addLine = function(line) {
    // this.removeLine(line.name);
    this.config.lines.push(line);
  }
  this.removeLine = function(name) {
    for (let i = 0; i < this.config.lines.length; i++) {
      if (this.config.lines[i].name === undefined) continue;
      if (this.config.lines[i].name === name) {
        this.config.lines.splice(i, 1);
      }
    }
  }
  this.setZoomInfo = function(index) {
    this.linkInfo.unitX = this.zoomInfo.list[index] * this.scale;
    if (this.linkInfo.unitX < this.scale) this.linkInfo.unitX = this.scale;
    this.linkInfo.spaceX = (this.linkInfo.unitX / this.scale) / 4 * this.scale;
    if (this.linkInfo.spaceX < this.scale) this.linkInfo.spaceX = this.scale;

    if (this.childCharts['zoomin']) {
      if (this.zoomInfo.index === 0) this.childCharts['zoomin'].setStatus('disabled');
      else this.childCharts['zoomin'].setStatus('enabled');
    }
    if (this.childCharts['zoomout']) {
      if (this.zoomInfo.index === this.zoomInfo.list.length - 1) this.childCharts['zoomout'].setStatus('disabled');
      else this.childCharts['zoomout'].setStatus('enabled');
    }
  }
  this.setHotButton = function(chart) {
    for (const name in this.childCharts) {
      if (this.childCharts[name] === chart) {
        this.childCharts[name].focused = true;
      } else {
        this.childCharts[name].focused = false;
      }
    }
  }
  // ////////////////////////////////////////////////
  // 下面的函数为绘图函数，
  // ////////////////////////////////////////////////

  this.drawClear = function() {
    _fillRect(this.context, this.rectMain.left, this.rectMain.top, this.rectMain.width, this.rectMain.height, this.color.back);
    _drawBegin(this.context, this.color.grid);
    '../util/cl.draw';(this.context, this.rectMain.left, this.rectMain.top, this.rectMain.width, this.rectMain.height);
    _drawEnd(this.context);
  }
  this.drawChildCharts = function() {
    let top;
    for (const name in this.childCharts) {
      if (!this.childCharts[name].focused) {
        this.childCharts[name].onPaint();
      } else {
        top = this.childCharts[name];
      }
    }
    if (top) top.onPaint();
  }
  this.drawChildLines = function () {
    for (const name in this.childLines) {
      if (this.childLines[name].hotKey !== undefined) {
        this.childLines[name].onPaint(this.childLines[name].hotKey);
      } else {
        this.childLines[name].onPaint(this.hotKey);
      }
    }
  }
  this.drawTitleInfo = function (index) {
    if (index < 0 || index > this.linkInfo.maxIndex) index = this.linkInfo.maxIndex;
    this.childDraws['TITLE'].onPaint(this.father.getMoveData(this.config.lines, index));
  }
  this.drawChildDraws = function (name) {
    if (this.childDraws[name] !== undefined) {
      if (name === 'TITLE') {
        this.drawTitleInfo(this.linkInfo.moveIndex);
      } else {
        this.childDraws[name].onPaint();
      }
    }
  }
  this.onPaint = function() {
    this.data = this.father.getData(this.hotKey);
    this.father.readyData(this.data, this.config.lines);

    _setLineWidth(this.context, this.scale);
    this.drawClear(); // 清理画图区

    this.drawChildDraws('GRID'); // 先画线格
    // 为画图做准备工作
    this.readyDraw();
    this.drawChildDraws('AXISX');
    this.drawChildDraws('AXISY_LEFT');
    this.drawChildDraws('AXISY_RIGHT');

    this.drawChildLines();// 画出所有的线

    this.drawChildDraws('TITLE');
    this.drawChildCharts();

    this.img = _getImageData(this.context, this.rectMain.left, this.rectMain.top, this.rectMain.width, this.rectMain.height);
  };

  // ///////////////////////////////////////////////////////////
  // 画图前的准备工作
  // ////////////////////////////////////////////////////////////
  this.getMiddle = function(method) {
    let middle = this.config.axisY.left.middle;
    if (method === 'fixedRight') middle = this.config.axisY.right.middle;
    if(middle==='before') return this.static.before;
    if(middle==='zero') return 0;
    return undefined;
  }
  this.calcMaxMin = function(data, extremum, start, stop) {
    const mm = {
      max: 0.0,
      min: 0.0
    };
    if (data === undefined || isEmptyArray(data.value)) {
      if (extremum.method === 'fixedLeft' || extremum.method === 'fixedRight' ) {
        const middle = this.getMiddle(extremum.method);
        mm.min = middle * (1 - 0.01);
        mm.max = middle * (1 + 0.01);
      }
      return mm;
    }

    let value;
    if (start === undefined) start = 0;
    if (stop === undefined) stop = data.value.length - 1;

    for (let k = start; k <= stop; k++) {
      if (!isEmptyArray(extremum.maxvalue)) {
        for (let m = 0; m < extremum.maxvalue.length; m++) {
          if (typeof(extremum.maxvalue[m]) !== 'string') continue;
          value = getValue(data, extremum.maxvalue[m], k);
          if (value > 0 && value > mm.max) {
            mm.max = value;
          }
        }
      }
      if (!isEmptyArray(extremum.minvalue)) {
        for (let m = 0; m < extremum.minvalue.length; m++) {
          if (typeof(extremum.minvalue[m]) !== 'string') continue;
          value = getValue(data, extremum.minvalue[m], k);
          if (mm.min === 0.0) mm.min = value;
          if (value > 0 && value < mm.min) {
            mm.min = value;
          }
        }
      }
    }
    // //////////////////
    if (!isEmptyArray(extremum.maxvalue)) {
      for (let m = 0; m < extremum.maxvalue.length; m++) {
        if (typeof(extremum.maxvalue[m]) === 'number') {
          mm.max = extremum.maxvalue[m];
          break;
        }
      }
    }
    if (!isEmptyArray(extremum.minvalue)) {
      for (let m = 0; m < extremum.minvalue.length; m++) {
        if (typeof(extremum.minvalue[m]) === 'number') {
          mm.min = extremum.minvalue[m];
          break;
        }
      }
    }
    if (extremum.method === 'fixedLeft' || extremum.method === 'fixedRight' ) {
      const middle = this.getMiddle(extremum.method);
      if (mm.max === mm.min) {
        if (mm.max > middle) mm.min = middle;
        if (mm.min < middle) mm.max = middle;
      }
      const maxrate = Math.abs(mm.max - middle);
      const minrate = Math.abs(middle - mm.min);
      if (maxrate / middle < 0.01 && minrate / middle < 0.01 &&
          this.static.stktype !== STOCK_TYPE_INDEX) {
        mm.min = middle * (1 - 0.01);
        mm.max = middle * (1 + 0.01);
      } else {
        if (maxrate > minrate) {
          mm.min = middle - maxrate;
        } else {
          mm.max = middle + minrate;
        }
      }
      if (mm.min < 0) mm.min = 0;
    }
    // console.log('getmaxmin', mm, start, stop);

    return mm;
  }
  this.readyScroll = function() { // 计算最大最小值等
    if (this.scroll.display === 'none') return;
    if (this.childCharts['HSCROLL'] !== undefined) {
      let left = getValue(this.data, 'time', this.linkInfo.minIndex);
      left = formatShowTime(this.data.key, left, this.father.datalayer.tradetime[0].begin);
      let right = getValue(this.data, 'time', this.linkInfo.maxIndex);
      right = formatShowTime(this.data.key, right,
            this.father.datalayer.tradetime[this.father.datalayer.tradetime.length - 1].end);
      let head = getValue(this.data, 'time', 0);
      head = formatShowTime(this.data.key, head, this.father.datalayer.tradetime[0].begin);
      let tail = getValue(this.data, 'time', this.data.value.length - 1);
      tail = formatShowTime(this.data.key, tail,
            this.father.datalayer.tradetime[this.father.datalayer.tradetime.length - 1].end);

      this.childCharts['HSCROLL'].onChange({
        head,
        tail,
        left,
        right,
        min: this.linkInfo.minIndex,
        max: this.linkInfo.maxIndex,
        range: this.data.value.length
      });
    }
  }
  this.getDataRange = function (data) {
    const out = { minIndex: -1, maxIndex: -1 };
    if (isEmptyArray(data.value) || isEmptyArray(this.data.value)) return out;
    const start = getValue(this.data, 'time', this.linkInfo.minIndex);
    const stop = getValue(this.data, 'time', this.linkInfo.maxIndex);
    for (let k = 0; k <= data.value.length - 1; k++) {
      const tt = getValue(data, 'time', k);
      if (tt >= start) { out.minIndex = k; break; }
    }
    for (let k = data.value.length - 1; k >= 0; k--) {
      const tt = getValue(data, 'time', k);
      if (tt <= stop) { out.maxIndex = k; break; }
    }
    return out;
  }
  this.readyDraw = function () { // 计算最大最小值等
    if (this.data === undefined) return;

    if (this.config.axisX.type === 'day1') {
      setFixedLineFlags(
        this.linkInfo,
        {
          width: this.rectChart.width,
          size: getSize(this.data),
          maxCount: getMinuteCount(this.father.datalayer.tradetime)
        }
      );
    } else if (this.config.axisX.type === 'day5') {
      setFixedLineFlags(
        this.linkInfo,
        {
          width: this.rectChart.width,
          size: getSize(this.data),
          maxCount: 5 * getMinuteCount(this.father.datalayer.tradetime)
        }
      );
    } else {
      setMoveLineFlags(
        this.linkInfo,
        {
          width: this.rectChart.width,
          size: getSize(this.data)
        }
      );
    }
    // 画滚动块
    this.readyScroll();

    // 求最大最小值
    let mm, maxmin;
    // const force = true;   // 由于定义了没有在后面使用，因此注释掉
    for (let i = 0; i < this.config.lines.length; i++) {
      if (isEmptyArray(this.config.lines[i].extremum.maxvalue) && 
          isEmptyArray(this.config.lines[i].extremum.minvalue)) continue;
      // 只对第一个线和有需要的线计算最大最小值
      const ds = this.getLineDS(this.config.lines[i]);

      if (ds.mode !== 'main') {
        const newdata = this.father.getData(ds.key);
        const range = this.getDataRange(newdata);
        mm = this.calcMaxMin(newdata, this.config.lines[i].extremum,
          range.minIndex, range.maxIndex);
      } else {
        mm = this.calcMaxMin(this.data, this.config.lines[i].extremum,
          this.linkInfo.minIndex, this.linkInfo.maxIndex);
      }
      if (maxmin === undefined) maxmin = mm;
      else {
        maxmin.max = maxmin.max > mm.max ? maxmin.max : mm.max;
        maxmin.min = maxmin.min < mm.min ? maxmin.min : mm.min;
      }
    } // for
    this.maxmin = maxmin;
    this.maxmin.unitY = (this.rectChart.height - 2) / (this.maxmin.max - this.maxmin.min); // 一个单位价位多少像素

    // console.log('maxmin', this.maxmin);
  };


  // ////////////////////////////////////////////////
  // 下面的函数为事件处理函数，
  // ////////////////////////////////////////////////
  this.onClick = function(event) {
    // console.log('click', this.axisPlatform);
    if (this.axisPlatform !== 'phone') {
      this.showCursorLine = !this.showCursorLine;
      if (this.showCursorLine) {
        this.father.eventLayer.boardEvent(this.father, 'onMouseMove', event, this);
      } else {
        event.reDraw = true;  // 需要重画
        this.father.eventLayer.boardEvent(this.father, 'onMouseOut', event, this);
      }
    }
  }
  this.onLongPress = function(event) {
    this.showCursorLine = true;
    this.father.eventLayer.boardEvent(this.father, 'onMouseMove', event, this);
  }
  this.onMouseOut = function(event) {
    if (this.showCursorLine || event.reDraw) {
      this.onPaint();
    }
  }
  this.onMouseWheel = function(event) {
    const step = Math.floor(event.deltaY / 10);
    if (step >= 1) {
      if (this.zoomInfo.index > 0) {
        if (this.linkInfo.maxIndex < this.data.value.length - 1) {
          const mid = Math.floor((this.linkInfo.maxIndex + this.linkInfo.minIndex) / 2 + 1);
          this.linkInfo.moveDate = getValue(this.data, 'time', mid);
          this.linkInfo.minIndex = -2;
        } else {
          this.linkInfo.minIndex = -1;
        }
        this.zoomInfo.index--;
        this.setZoomInfo(this.zoomInfo.index);
        this.father.onPaint();
      }
    } else if (step <= -1) {
      if (this.zoomInfo.index < this.zoomInfo.list.length - 1) {
        if (this.linkInfo.maxIndex < this.data.value.length - 1) {
          const mid = Math.floor((this.linkInfo.maxIndex + this.linkInfo.minIndex) / 2 + 1);
          this.linkInfo.moveDate = getValue(this.data, 'time', mid);
          this.linkInfo.minIndex = -2;
        } else {
          this.linkInfo.minIndex = -1;
        }
        this.zoomInfo.index++;
        this.setZoomInfo(this.zoomInfo.index);
        this.father.onPaint();
      }
    }
  }
  this.onKeyDown = function(event) {
    switch (event.keyCode) {
      case 38: // up
        break;
      case 40: // down
        break;
      case 37: // left
        break;
      case 39: // right
        break;
    }
    // console.log('key:', event.keyCode);
  }
  this.onMouseMove = function(event) {
    if (this.img === undefined) return;
    if (this.linkInfo.hideInfo) return;
    if (!this.showCursorLine) return;
    // this.draw_clear();
    // 找到X坐标对应的数据索引
    const mousePos = event.mousePos;
    _putImageData(this.context, this.img, this.rectMain.left, this.rectMain.top);

    const mouseIndex = this.getMouseMoveData(mousePos.x);
    let idx, valueY;
    let valueX = mouseIndex;
    if (mouseIndex > 0) {
      if (this.config.axisX.type === 'day1' || this.config.axisX.type === 'day5') {
        valueX = valueX % 240;
        valueX = fromIndexToTradeTime(valueX, this.father.tradetime, this.father.tradedate);
        idx = findLabelToIndex(this.data, mouseIndex, 'idx');
      } else {
        valueX = getValue(this.data, 'time', mouseIndex);
        idx = mouseIndex;
      }
      if (this.config.title.display !== 'none') {
        // console.log(this.name, mouseIndex, 'mouseIndex', this.rectChart, mousePos, _inRangeX(this.rectChart, mousePos.x));
        if (inRangeX(this.rectChart, mousePos.x)) {
          this.drawTitleInfo(idx);
        }
      }
      if (this.linkInfo.moveIndex !== mouseIndex) {
        this.linkInfo.moveIndex = mouseIndex;
        this.callback({
          event: 'mousemove',
          before: mouseIndex > 0 ? getValue(this.data, 'close', mouseIndex - 1) : getValue(this.data, 'open', 0),
          data: this.data.value[mouseIndex]
        });
      }
    }
    this.childDraws['CURSOR'].onPaint(mousePos, valueX, valueY);
  }

  // 事件监听
  // ////////////////////////////////////////////////////////////////
  //   处理数据的函数集合
  // ///////////////////////////////////////////////////////////////
  this.getMouseMoveData = function(xpos) {
    const elementW = this.linkInfo.unitX;
    const spaceX = this.linkInfo.spaceX;
    const idx = Math.round((xpos - this.rectChart.left) / (elementW + spaceX) - 0.5);
    if (this.config.axisX.type === 'day1') {
      return idx;
    } else if (this.config.axisX.type === 'day5') {
      return idx;
    } else {
      return this.linkInfo.minIndex + idx;
    }
  };

  // /// ClChart end.
}