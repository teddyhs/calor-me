/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// The (global) calorie counter object
var counter;

// We define three levels
//
//  good - Consumed calories less than spent calories
//  ok   - Consumed calories roughly equal to spent calories
//  bad  - Consumed calories greater than spent calories
//
// The cutoffs for these levels are defined below in terms of the ratio of
// consumed calories to spent calories:
var OK_CUTOFF  = 0.95;
var BAD_CUTOFF = 1.2;

function init() {
  counter = new CalorieCounter();

  // Update once it is ready
  counter.oninit = function() {
    document.querySelector("input[name=weight]").value = counter.weight;
    // XXX update height
    // XXX update sex (incl. diagram)
    updateSummary();
  };

  // Add event handlers to the buttons.
  //
  // Although it is possible to attach the event handlers in the HTML using
  // attributes such as "onclick" this makes the HTML harder to read.
  //
  // Instead we are using an approach called "unobtrusive javascript" to add the
  // event handlers later.
  initTabs();
  initSummary();
  initLog();
  initSettings();
  initPreFillData();
}
window.addEventListener("load", init, false);

function initTabs() {
  // Tab navigation
  var tablinks = document.querySelectorAll("a[aria-role=tab]");
  for (var i = 0; i < tablinks.length; i++) {
    tablinks[i].addEventListener("click",
      function(e) {
        // Update tabs
        var tabs = document.querySelectorAll("a[aria-role=tab]");
        for (var j = 0; j < tabs.length; j++) {
          var tab = tabs[j];
          tab.setAttribute("aria-selected",
                           tab === e.target ? "true" : "false");
        }

        // Update panels
        var selectedId = e.target.getAttribute("aria-controls");
        var panels = document.querySelectorAll("section[aria-role=tabpanel]");
        for (var j = 0; j < panels.length; j++) {
          var panel = panels[j];
          panel.setAttribute("aria-hidden",
                             panel.id === selectedId ? "false" : "true");
        }

        // Don't follow the link
        e.preventDefault();

        // Play tab switch sound if available
        var sfx = document.getElementById('tabSwitchSound');
        if (sfx && sfx.currentSrc)
          sfx.play();
      },
      false
    );
  }
}

/* --------------------------------------
 *
 * SUMMARY
 *
 * --------------------------------------*/

function initSummary() {
  updateSummary();

  document.getElementById("showFoodForm").addEventListener("click",
    function(e) {
      launchDialogById('add-food');
      e.preventDefault();
    }, false);
  document.getElementById("showActivityForm").addEventListener("click",
    function(e) {
      launchDialogById('add-activity');
      e.preventDefault();
    }, false);

  // Set up handler for the "Cancel" button on the little forms that pop up
  //
  // This is complicated because we are doing it in a generic fashion where we
  // first search for the buttons and then try to determine the "dialog" they
  // belong too.
  //
  // First, search for the buttons using the Selectors API
  var cancelButtons =
    document.querySelectorAll("section[aria-role=dialog] button.cancel");
  for (var i = 0; i < cancelButtons.length; i++) {
    cancelButtons[i].addEventListener("click",
      function(e) {
        // We have the button, now we search upwards to find the first <section>
        // element with the attribute aria-role="dialog"
        var dialog = e.target;
        while(dialog &&
              (dialog.tagName !== "SECTION" ||
               dialog.getAttribute("aria-role").toLowerCase() !== "dialog")) {
          dialog = dialog.parentNode;
        }
        // If we found the dialog, hide it
        if (dialog) {
          hideDialog(dialog);
          e.preventDefault();
        }
      }, false);
  }

  // Handle changes to weight
  document.querySelector("input[name=weight]").addEventListener("change",
    onChangeWeight, false);

  // Handle submitting the different forms
  document.querySelector('#add-food form').addEventListener("submit",
      function(e) {
        addFood();
        e.preventDefault();
      }, false
    );
  document.querySelector('#add-activity form').addEventListener("submit",
      function(e) {
        addActivity();
        e.preventDefault();
      }, false
    );
}

function launchDialogById(id) {
  var dialog = document.getElementById(id);
  console.assert(dialog, "Dialog not found");
  resetDialog(dialog);
  showDialog(dialog);
}

function showDialog(dialog) {
  showOrHideDialog(dialog, "show");
}

function hideDialog(dialog) {
  showOrHideDialog(dialog, "hide");
}

function showOrHideDialog(dialog, action) {
  var overlay = document.querySelector(".overlay-container");
  overlay.style.display = action == "show" ? "block" : "none";
  dialog.setAttribute("aria-hidden", action == "show" ? "false" : "true");
}

function resetDialog(dialog) {
  var forms = dialog.getElementsByTagName("form");
  for (var i = 0; i < forms.length; i++ ) {
    forms[i].reset();
  }
}

function onChangeWeight(event) {
  var weight = parseFloat(event.target.value);
  if (!weight)
    return;
  counter.setWeight(weight);
  updateSummary();
}

function addFood() {
  var foodForm = document.forms.food;
  var food = foodForm.food.value;
  var quantity = parseFloat(foodForm.quantity.value) || null;
  var calories = parseFloat(foodForm['calorie-count'].value);
  counter.addFood(food, quantity, calories, "kcal",
    function(item) {
      // XXX update summary table
      console.log(item);
    });
  hideDialog(document.getElementById('add-food'));
  updateSummary();
  var rise = document.getElementById('riseSound');
  if (rise.currentSrc)
    rise.play();
}

function addActivity() {
  // TODO
  counter.addActivity(2000, "kcal");
  hideDialog(document.getElementById('add-activity'));
  updateSummary();
  var fall = document.getElementById('fallSound');
  if (fall.currentSrc)
    fall.play();
}

function updateSummary() {
  // Update figure
  var figure = document.getElementById("figure");
  var level = counter.kjIn / counter.kjOut;
  figure.contentDocument.setLevel(level, getClassLevel(level));
  // Update text summary
  var text = document.getElementById("text-summary");
  text.querySelector('.net-summary').textContent =
    (counter.kcalIn - counter.kcalOut).toFixed(0) + "cal";
  text.querySelector('.consumed-summary').textContent =
    counter.kcalIn.toFixed(0) + "cal consumed";
  text.querySelector('.spent-summary').textContent =
    counter.kcalOut.toFixed(0) + "cal spent";
}

function getClassLevel(level) {
  return level < OK_CUTOFF
    ? "good"
    : level < BAD_CUTOFF
    ? "ok" : "bad";
}

/* --------------------------------------
 *
 * LOG
 *
 * --------------------------------------*/

function initLog() {
  // Register one event listener on the log container and use it to detect
  // clicks on the summary elements (which are dynamically added).
  // This works so long as we turn off pointer-events on all child content
  // which is certainly not very presentational.
  document.getElementById("log").addEventListener("click",
      function (evt) {
        if (evt.target.tagName === "DETAILS") {
          var details = evt.target;
          if (details.hasAttribute("open")) {
            details.removeAttribute("open");
          } else {
            details.setAttribute("open", "open");
          }
        }
      }, false
    );
}

/* --------------------------------------
 *
 * SETTINGS
 *
 * --------------------------------------*/

function initSettings() {
  // Listen to changes to gender
  var genderRadios =
    document.querySelectorAll("input[type=radio][name=gender]");
  for (var i = 0; i < genderRadios.length; i++) {
    var radio = genderRadios[i];
    radio.addEventListener("change", onChangeGender, false);
  }

  // TODO Need to store the gender, set the radio buttons and update the
  // diagram accordingly
}

function onChangeGender(evt) {
  var figure = document.getElementById("figure");
  figure.contentDocument.setGender(evt.target.value);
}

/* --------------------------------------
 *
 * PRE-FILL DATA
 *
 * --------------------------------------*/

var prefillLists = {};

function initPreFillData() {
  // Foods list
  var foods = "food-data.json";
  var foodsList = document.getElementById("foods");
  fetchPrefillData(foods, foodsList,
    function(list) {
      var hash = new Object;
      for (var i = 0; i < list.length; i++) {
        hash[list[i][0].trim().toLowerCase()] = list[i][1];
      }
      prefillLists.foods = hash;
    });
  var foodForm = document.forms.food;
  foodForm.food.addEventListener("change", calcFood, false);
  foodForm.quantity.addEventListener("change", calcFood, false);
}

function fetchPrefillData(url, targetList, onComplete) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  if (xhr.overrideMimeType) {
    xhr.overrideMimeType('application/json; charset=utf-8');
  }
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if (xhr.status == 200 || xhr.status === 0) {
        fillList(xhr.responseText, targetList, onComplete);
      } else {
        console.log("Failed to load " + url);
      }
    }
  };
  xhr.send(null);
}

function fillList(jsonData, list, onComplete) {
  var data = JSON.parse(jsonData);
  // Check we've got a reasonable list
  if (!Array.isArray(data) ||
      data.length < 1 ||
      !Array.isArray(data[0]) ||
      typeof data[0][0] !== "string")
    return;
  // Clear children of list
  while (list.hasChildNodes())
    list.removeChild(list.lastChild);
  // Add an option for each item in the list
  for (var i = 0; i < data.length; i++) {
    var option = document.createElement("OPTION");
    option.setAttribute("value", data[i][0]);
    list.appendChild(option);
  }
  // Pass the list on
  if (onComplete) {
    onComplete(data);
  }
}

function calcFood() {
  var foodForm = document.forms.food;
  var food = foodForm.food.value.trim().toLowerCase();
  if (!food)
    return;
  var multiplier = prefillLists.foods[food];
  if (typeof multiplier === "undefined")
    return;
  var quantity = parseFloat(foodForm.quantity.value);
  if (isNaN(quantity))
    return;
  // Multiplier is kJ per 100g
  var result = Math.round(multiplier / 100 * quantity / counter.KJ_PER_KCAL);
  foodForm['calorie-count'].value = result;
}

/* --------------------------------------
 *
 * CALORIE COUNTER MODEL
 *
 * --------------------------------------*/

// TODO
// This is all placeholder code for the moment.
// The calculation of the BMR needs to be based on the settings etc.
//
// One note is that internally everything is represented in metric (kJ) but we
// offer interfaces for reporting values in calories (actually kilocalories).

CalorieCounter = function() {
  this.consumedToday = 0;
  this.spentToday    = 0;
  this.bmr           = 8000;
  this._db           = null;
  this.weight        = null;

  this.__defineGetter__("kjOut", function() {
    return this.bmr + this.spentToday;
  });
  this.__defineGetter__("kcalOut", function() {
    return this.kjOut / this.KJ_PER_KCAL;
  });
  this.__defineGetter__("kjIn", function() {
    return this.consumedToday;
  });
  this.__defineGetter__("kcalIn", function() {
    return this.kjIn / this.KJ_PER_KCAL;
  });

  this.init();
}

CalorieCounter.prototype.KJ_PER_KCAL = 4.2;

CalorieCounter.prototype.init = function() {
  this._getDb(
    function(db) {
      var trans = db.transaction(["weightLog", "settings"]);
      if (this.oninit)
        trans.oncomplete = this.oninit;
      trans.objectStore("weightLog").openCursor(null, "prev").onsuccess =
        function(event) {
        var cursor = event.target.result;
        if (cursor) {
          this.weight = cursor.value.weight;
        }
      }.bind(this);
    }.bind(this)
  );
}

CalorieCounter.prototype.addActivity = function(amount, unit) {
  if (typeof unit !== "undefined" && unit.toLowerCase() === "kcal")
    amount *= this.KJ_PER_KCAL;
  this.spentToday += amount;
}

CalorieCounter.prototype.addFood = function(food, quantity, amount, unit,
  onsuccess) {
  if (typeof unit !== "undefined" && unit.toLowerCase() === "kcal")
    amount *= this.KJ_PER_KCAL;
  this.consumedToday += amount;

  log = {
    type: "food",
    food: food,
    quantity: quantity,
    kj: amount
  };
  this._addLog(log, onsuccess);
}

CalorieCounter.prototype.setWeight = function(weight) {
  // XXX Re-calculate BMR
  var entry = {
    localDate: this._getLocalDate(),
    weight: weight
  };
  this._getDb(
    function(db) {
      db.transaction(["weightLog"], "readwrite").objectStore("weightLog").
        put(entry);
    }
  );
  this.weight = weight;
}

window.indexedDB = window.indexedDB || window.mozIndexedDB ||
                   window.webkitIndexedDB || window.msIndexedDB;
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange ||
                     window.msIDBKeyRange;

CalorieCounter.prototype._getDb = function(onsuccess) {
  if (!this._db) {
    var request = window.indexedDB.open("CalorieCounter", 3);
    request.onsuccess = function(event) {
      this._db = request.result;
      // Set up database-level error logging
      this._db.onerror = function(event) {
        console.log(event.target.result);
      };
      onsuccess(this._db);
    }.bind(this);
    request.onerror = function(event) {
      // Just log the error and forget about saving
      console.log(event.target.errorCode);
    }
    request.onupgradeneeded = function(event) {
      this._db = event.target.result;
      /* Log object store */
      if (event.oldVersion < 1) {
        this._db.createObjectStore("log", { autoIncrement: true });
      }
      var log = event.target.transaction.objectStore("log");
      if (event.oldVersion < 2) {
        log.createIndex("time", "time", { unique: false });
      }
      /* Weight object store */
      var weights =
        this._db.createObjectStore("weightLog", { keyPath: "localDate" });
      /* Settings object store */
      var settings = this._db.createObjectStore("settings");
    }.bind(this);
  } else {
    onsuccess(this._db);
  }
}

CalorieCounter.prototype._addLog = function(log, onsuccess) {
  var data = log;
  data.time = Date.now();
  data.localDate = this._getLocalDate();
  this._getDb(
    function(db) {
      db.transaction(["log"], "readwrite").objectStore("log").add(log).
        onsuccess = function(event) {
        if (onsuccess) {
          var result = log;
          result.id = event.target.result;
          onsuccess(result);
        }
      };
    }
  );
}

CalorieCounter.prototype._getLocalDate = function(log, onsuccess) {
  // Calculate the date only (minus time component) in local time and convert to
  // UTC.
  var d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

CalorieCounter.prototype._getLogEntriesInRange = function(start, end, onsuccess)
{
  var entries = [];
  this._getDb(
    function(db) {
      var objectStore = db.transaction(["log"]).objectStore("log");
      var range = end
                ? IDBKeyRange.bound(start, end, true, false)
                : IDBKeyRange.lowerBound(start, true);
      var index = objectStore.index("time");
      index.openCursor(range).onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          entries.push(cursor.value);
          cursor.continue();
        } else {
          onsuccess(entries);
        }
      }
    }
  );
}
