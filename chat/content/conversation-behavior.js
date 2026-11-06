/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Shared behavior for the conversation message styles.
 * Loaded by imThemes.sys.mjs into the conversation document. */

/* globals convertTimeUnits */

// System event collapse: groups of consecutive system messages are collapsed
// to their first and last entry to avoid long digests of join/part events.
// The caret between them toggles the hidden middle events.
const MIN_EVENTS_TO_COLLAPSE = 4;

function maybeCollapseEvents(node) {
  // Emptying a hidden group is prevented by ignoring no-collapse messages and
  // by never collapsing a group twice.
  let group = node;
  if (group.classList.contains("consecutive")) {
    while (group.parentElement?.classList?.contains("event")) {
      group = group.parentElement;
    }
  }
  if (!group.classList.contains("event")) {
    return;
  }
  if (group.querySelector(".no-collapse")) {
    return;
  }
  const events = group.querySelectorAll(":scope > .event-row");
  if (events.length < MIN_EVENTS_TO_COLLAPSE) {
    return;
  }
  if (group.querySelector(":scope > .event-toggle")) {
    // The group is already collapsed: hide newly arriving events too, so the
    // group keeps showing only its first and last entries. If the caret was
    // used to expand the group, leave new events visible.
    if (!group.classList.contains("hide-children")) {
      return;
    }
    for (let i = 1; i < events.length - 1; i++) {
      events[i].classList.add("event-collapsed");
    }
    return;
  }

  const toggle = document.createElement("div");
  toggle.className = "event-toggle";
  toggle.setAttribute("role", "button");
  toggle.setAttribute("tabindex", "0");
  const toggleCollapsed = () => group.classList.toggle("hide-children");
  toggle.addEventListener("click", toggleCollapsed);
  toggle.addEventListener("keydown", event => {
    if (event.key == "Enter") {
      toggleCollapsed();
      event.preventDefault();
    }
  });

  // Insert the caret before the second event, then hide everything but the
  // first event and the last event.
  group.insertBefore(toggle, events[1]);
  for (let i = 1; i < events.length - 1; i++) {
    events[i].classList.add("event-collapsed");
  }
  group.classList.add("hide-children");
}

// Time interval markers: for the bubbles style, inserts a "time passed" line
// between messages that were sent more than MIN_INTERVAL_MINUTES apart.
const MIN_INTERVAL_MINUTES = 30;
const MIN_INTERVAL_SECONDS = MIN_INTERVAL_MINUTES * 60;

function formatInterval(seconds) {
  if (typeof convertTimeUnits == "function") {
    const valuesAndUnits = convertTimeUnits(seconds);
    if (!valuesAndUnits[2]) {
      valuesAndUnits.splice(2, 2);
    }
    return valuesAndUnits.join(" ");
  }
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} hr ${rest} min` : `${rest} min`;
}

function maybeInsertInterval(node) {
  const chat = document.getElementById("Chat");
  if (chat.dataset.bubbles != "true") {
    return;
  }
  if (
    node.classList.contains("consecutive") ||
    node.classList.contains("event") ||
    node.classList.contains("no-collapse")
  ) {
    return;
  }
  if (node.previousElementSibling?.classList.contains("message-interval")) {
    // Replacement of the message; a marker already exists.
    return;
  }
  const time = Number(node.dataset.time);
  if (!time) {
    return;
  }
  let previous = node.previousElementSibling;
  while (previous && !previous.classList.contains("message")) {
    previous = previous.previousElementSibling;
  }
  const previousTime = Number(previous?.dataset.time);
  if (!previousTime) {
    return;
  }
  const gap = time - previousTime;
  if (gap < MIN_INTERVAL_SECONDS) {
    return;
  }
  const interval = document.createElement("div");
  interval.className = "message-interval";
  interval.textContent = formatInterval(gap);
  node.parentNode.insertBefore(interval, node);
}

const chat = document.getElementById("Chat");
const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (
        !(node instanceof HTMLElement) ||
        !node.matches(".message, .event-row")
      ) {
        continue;
      }
      maybeCollapseEvents(node);
      maybeInsertInterval(node);
    }
  }
});
observer.observe(chat, { childList: true, subtree: true });
