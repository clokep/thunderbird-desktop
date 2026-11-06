/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

const ParserUtils = Cc["@mozilla.org/parserutils;1"].getService(
  Ci.nsIParserUtils
);
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/conversations.ftl"], true)
);

var kLineBreak = "@mozilla.org/windows-registry-key;1" in Cc ? "\r\n" : "\n";

ChromeUtils.defineLazyGetter(lazy, "TXTToHTML", function () {
  const cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(
    Ci.mozITXTToHTMLConv
  );
  return aTXT => cs.scanTXT(aTXT, cs.kEntities);
});

ChromeUtils.defineLazyGetter(lazy, "gTimeFormatter", () => {
  return new Services.intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});

ChromeUtils.defineESModuleGetters(lazy, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
  ToLocaleFormat: "resource:///modules/ToLocaleFormat.sys.mjs",
});

/**
 * Format the time of a message.
 *
 * @param {imIMessage} aMsg
 * @param {string} [aFormat] - A format string for ToLocaleFormat, e.g. "%H:%M".
 * @returns {string} The formatted time.
 */
function formatTime(aMsg, aFormat) {
  const date = new Date(aMsg.time * 1000);
  if (aFormat) {
    return lazy.ToLocaleFormat(aFormat, date);
  }
  return lazy.gTimeFormatter.format(date);
}

function getMessageClasses(aMsg, isNext, isContext) {
  const msgClass = [];

  if (aMsg.incoming) {
    msgClass.push("incoming");
  } else if (aMsg.outgoing) {
    msgClass.push("outgoing");
  }

  if (aMsg.action) {
    msgClass.push("action");
  }
  if (aMsg.autoResponse) {
    msgClass.push("autoreply");
  }
  if (aMsg.containsNick) {
    msgClass.push("nick");
  }
  if (aMsg.error) {
    msgClass.push("error");
  }
  if (aMsg.delayed) {
    msgClass.push("delayed");
  }
  if (aMsg.notification) {
    msgClass.push("notification");
  }
  if (aMsg.noFormat) {
    msgClass.push("monospaced");
  }
  if (aMsg.noCollapse) {
    msgClass.push("no-collapse");
  }

  // Future states, reserved until the corresponding message flags exist.
  if (aMsg.pending) {
    msgClass.push("pending");
  }
  if (aMsg.deleted) {
    msgClass.push("deleted");
  }
  if (aMsg.edited) {
    msgClass.push("edited");
  }

  if (isNext) {
    msgClass.push("consecutive");
  }
  if (isContext) {
    msgClass.push("context");
  }

  return msgClass.join(" ");
}

function formatAutoResponce(aTxt) {
  return lazy.l10n.formatValueSync("auto-reply", { message: aTxt });
}

/**
 * Get the URL of the icon to display next to a message, if any.
 *
 * @param {imIMessage} aMsg
 * @returns {string} The icon URL, or an empty string.
 */
function getUserIconSrc(aMsg) {
  // If the protocol plugin provides an icon for the message, use it.
  const iconURL = aMsg.iconURL;
  if (iconURL) {
    return iconURL;
  }

  // For outgoing messages, use the current user icon.
  if (aMsg.outgoing) {
    const userIcon = aMsg.conversation.account.statusInfo.getUserIcon();
    if (userIcon) {
      return userIcon.spec;
    }
  }

  return "";
}

/**
 * Determine if a message should be grouped with a previous message.
 *
 * @param {imIMessage} aMsg - The message that is about to be appended.
 * @param {imIMessage} aPreviousMsg - The last message that was displayed.
 * @returns {boolean} If the message should be grouped with the previous one.
 */
export function isNextMessage(aMsg, aPreviousMsg) {
  if (
    !Services.prefs.getBoolPref(
      "messenger.options.messagesStyle.combineConsecutive",
      true
    )
  ) {
    return false;
  }

  if (!aPreviousMsg) {
    return false;
  }

  if (aMsg.system && aPreviousMsg.system) {
    return true;
  }

  if (
    aMsg.who != aPreviousMsg.who ||
    aMsg.outgoing != aPreviousMsg.outgoing ||
    aMsg.incoming != aPreviousMsg.incoming ||
    aMsg.system != aPreviousMsg.system
  ) {
    return false;
  }

  const timeDifference = aMsg.time - aPreviousMsg.time;
  const interval = Services.prefs.getIntPref(
    "messenger.options.messagesStyle.combineConsecutiveInterval",
    300
  );
  return timeDifference >= 0 && timeDifference <= interval;
}

/**
 * Determine whether the message was a next message when it was initially
 * inserted.
 *
 * @param {imIMessage} msg
 * @param {DOMDocument} doc
 * @returns {boolean} If the message is a next message. Returns false if the
 *   message doesn't already exist in the conversation.
 */
export function wasNextMessage(msg, doc) {
  return Boolean(
    doc.querySelector(`#Chat [data-remote-id="${CSS.escape(msg.remoteId)}"]`)
      ?.dataset.isNext
  );
}

/**
 * Create an HTML string to insert the message into the conversation.
 *
 * @param {imIMessage} aMsg
 * @param {object} [options]
 * @param {boolean} [options.isNext] - If this message is immediately following
 *   a message of the same origin. Used for visual grouping.
 * @param {boolean} [options.isContext] - If this message was already read by
 *   the user previously and just provided for context.
 * @returns {string} Raw HTML for the message.
 */
export function getHTMLForMessage(
  aMsg,
  { isNext = false, isContext = false } = {}
) {
  const className = getMessageClasses(aMsg, isNext, isContext);
  const content = `<span class="ib-msg-txt">${
    aMsg.autoResponse ? formatAutoResponce(aMsg.message) : aMsg.message
  }</span>`;
  const formattedTime = formatTime(aMsg, "%H:%M");

  if (aMsg.system) {
    // System messages are shown as compact rows. Consecutive system messages
    // are grouped: the first one creates a .message.event group container and
    // the following ones are inserted into it as flat .event-row siblings, so
    // that the shared conversation code can collapse the group.
    const row = `<div class="event-row ${className}" data-prpl="${
      aMsg.conversation.account.protocol.name
    }" data-time="${aMsg.time}">
      <div class="message-sidebar">
        <time class="message-time">${formattedTime}</time>
      </div>
      <div class="message-body">
        <div class="message-content">${content}</div>
      </div>
      <footer class="message-footer" hidden></footer>
    </div>`;
    if (isNext) {
      // The row and the insert anchor must be siblings so the next event is
      // inserted into the group instead of nesting inside the previous row.
      return `${row}<div id="insert"></div>`;
    }
    return `<div class="message event ${className}" data-prpl="${
      aMsg.conversation.account.protocol.name
    }" data-time="${aMsg.time}">
      ${row}
      <div id="insert"></div>
    </div>`;
  }

  const avatar = getUserIconSrc(aMsg);
  const sender = `<span class="ib-sender">${lazy.TXTToHTML(
    aMsg.alias || aMsg.who
  )}</span>`;
  const senderTime = `<time class="message-sender-time">${formattedTime}</time>`;
  const encrypted = aMsg.isEncrypted ? " message-encrypted" : "";
  // Expose the sender color to CSS so the bubbles style can tint the bubble.
  const senderColor = aMsg.color
    ? ` style="--sender-color: ${aMsg.color.replace(/^\s*color\s*:\s*/, "").replace(/;\s*$/, "")}"`
    : "";

  // Normal messages have no insert anchor: consecutive messages are appended
  // as flat siblings and the consecutive class controls their visual grouping,
  // as in the previous themes.
  return `<div class="message ${className}" data-prpl="${
    aMsg.conversation.account.protocol.name
  }" data-time="${aMsg.time}"${senderColor}>
    <div class="message-sidebar">
      ${avatar ? `<img class="message-avatar" src="${avatar}" alt="">` : ""}
      <time class="message-time">${formattedTime}</time>
    </div>
    <div class="message-body">
      <span class="message-sender${encrypted}" style="${aMsg.color}">${sender}${senderTime}</span>
      <div class="message-content">${content}</div>
    </div>
      <footer class="message-footer" hidden></footer>
  </div>`;
}

/**
 * Initialize the HTML document of a conversation browser.
 *
 * @param {prplIConversation} aConv
 * @param {DOMDocument} aDoc - The document of the conversation browser.
 * @param {object} [options]
 * @param {boolean} [options.bubbles] - If the bubbles style is enabled.
 * @param {boolean} [options.avatars] - If avatars are enabled.
 */
export function initHTMLDocument(
  aConv,
  aDoc,
  { bubbles = false, avatars = false } = {}
) {
  // Screen readers may read the title of the document, so provide one
  // to avoid an ugly fallback to the URL (see bug 1165).
  aDoc.title = aConv.title;

  function addCSS(aHref) {
    const link = aDoc.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", aHref);
    link.setAttribute("type", "text/css");
    aDoc.head.appendChild(link);
  }
  addCSS("chrome://chat/skin/conv.css");
  addCSS("chrome://messenger/skin/icons.css");
  addCSS("chrome://messenger/skin/colors.css");
  addCSS("chrome://messenger/skin/layout.css");
  addCSS("chrome://messenger/skin/spacings.css");
  addCSS("chrome://chat/skin/bubbles.css");
  aDoc.body.id = "ibcontent";

  const frag = getDocumentFragmentFromHTML(
    aDoc,
    '<div id="Chat" aria-live="polite"></div>'
  );
  aDoc.body.appendChild(frag);
  applyDisplayOptions(aDoc, { bubbles, avatars });

  const scriptTag = aDoc.createElement("script");
  scriptTag.src = "chrome://chat/content/conversation-behavior.js";
  aDoc.body.appendChild(scriptTag);

  aDoc.defaultView.convertTimeUnits = lazy.DownloadUtils.convertTimeUnits;
}

/**
 * Update the display options of a conversation document without reloading it.
 *
 * @param {DOMDocument} aDoc - The document of the conversation browser.
 * @param {object} [options]
 * @param {boolean} [options.bubbles] - If the bubbles style is enabled.
 * @param {boolean} [options.avatars] - If avatars are enabled.
 */
export function applyDisplayOptions(
  aDoc,
  { bubbles = false, avatars = false } = {}
) {
  const chat = aDoc.getElementById("Chat");
  if (!chat) {
    return;
  }
  chat.dataset.bubbles = bubbles;
  chat.dataset.avatars = avatars;
}

/**
 *
 * @param {imIMessage} aMsg
 * @param {string} aHTML
 * @param {DOMDocument} aDoc
 * @param {boolean} aIsNext
 * @returns {Element}
 */
export function insertHTMLForMessage(aMsg, aHTML, aDoc, aIsNext) {
  let insert = aDoc.getElementById("insert");
  if (insert && !aIsNext) {
    insert.remove();
    insert = null;
  }

  const parent = insert ? insert.parentNode : aDoc.getElementById("Chat");
  const documentFragment = getDocumentFragmentFromHTML(aDoc, aHTML);

  // If the parent already has a remote ID, we remove it, since it now contains
  // multiple different messages.
  if (parent.dataset.remoteId) {
    for (const child of parent.children) {
      child.dataset.remoteId = parent.dataset.remoteId;
      child.dataset.isNext = true;
    }
    delete parent.dataset.remoteId;
  }

  let result = documentFragment.firstElementChild;
  // store the prplIMessage object in each of the "root" node that
  // will be inserted into the document, so that selection code can
  // retrieve the message by just looking at the parent node until it
  // finds something.
  for (let root = result; root; root = root.nextElementSibling) {
    // Skip the insert placeholder.
    if (root.id === "insert") {
      continue;
    }
    root._originalMsg = aMsg;
    // Store remote ID of the message in the DOM for fast retrieval
    root.dataset.remoteId = aMsg.remoteId;
    if (aIsNext) {
      root.dataset.isNext = aIsNext;
    }
  }

  // make sure the result is an HTMLElement and not some text (whitespace)...
  while (
    result &&
    !(
      result.nodeType == result.ELEMENT_NODE &&
      result.namespaceURI == "http://www.w3.org/1999/xhtml"
    )
  ) {
    result = result.nextElementSibling;
  }
  if (insert) {
    parent.replaceChild(documentFragment, insert);
  } else {
    parent.appendChild(documentFragment);
  }
  return result;
}

/**
 * Replace the HTML of an already displayed message based on the matching
 * remote ID.
 *
 * @param {imIMessage} msg - Message to insert the updated contents of.
 * @param {string} html - The HTML contents to insert.
 * @param {Document} doc - The HTML document the message should be replaced
 *   in.
 * @param {boolean} isNext - If this message is immediately following a
 *   message of the same origin. Used for visual grouping.
 */
export function replaceHTMLForMessage(msg, html, doc, isNext) {
  // If the updated message has no remote ID, do nothing.
  if (!msg.remoteId) {
    return;
  }
  const message = getExistingMessage(msg.remoteId, doc);

  // If we couldn't find a matching message, do nothing.
  if (!message.length) {
    return;
  }

  const documentFragment = getDocumentFragmentFromHTML(doc, html);
  // We don't want to add an insert point when replacing a message.
  documentFragment.querySelector("#insert")?.remove();
  // store the prplIMessage object in each of the "root" nodes that
  // will be inserted into the document, so that the selection code can
  // retrieve the message by just looking at the parent node until it
  // finds something.
  for (
    let root = documentFragment.firstElementChild;
    root;
    root = root.nextElementSibling
  ) {
    root._originalMsg = msg;
    root.dataset.remoteId = msg.remoteId;
    if (isNext) {
      root.dataset.isNext = isNext;
    }
  }

  // Remove all but the first element of the original message
  if (message.length > 1) {
    const range = doc.createRange();
    range.setStartBefore(message[1]);
    range.setEndAfter(message[message.length - 1]);
    range.deleteContents();
  }
  // Insert the new message into the DOM
  message[0].replaceWith(documentFragment);
}

/**
 * Remove all elements belonging to a message from the document, based on the
 * remote ID of the message.
 *
 * @param {string} remoteId
 * @param {Document} doc
 */
export function removeMessage(remoteId, doc) {
  const message = getExistingMessage(remoteId, doc);

  // If we couldn't find a matching message, do nothing.
  if (!message.length) {
    return;
  }

  // Remove all elements of the original message
  const range = doc.createRange();
  range.setStartBefore(message[0]);
  range.setEndAfter(message[message.length - 1]);
  range.deleteContents();
}

/* Selection stuff */
function getEllipsis() {
  return lazy.l10n.formatValueSync(
    "messenger-conversations-selections-ellipsis"
  );
}

function _serializeDOMObject(aDocument, aInitFunction) {
  // This shouldn't really be a constant, as we want to support
  // text/html too in the future.
  const type = "text/plain";

  const encoder = Cu.createDocumentEncoder(type);
  encoder.init(aDocument, type, Ci.nsIDocumentEncoder.OutputPreformatted);
  aInitFunction(encoder);
  const result = encoder.encodeToString();
  return result;
}

function serializeRange(aRange) {
  return _serializeDOMObject(
    aRange.startContainer.ownerDocument,
    function (aEncoder) {
      aEncoder.setRange(aRange);
    }
  );
}

function serializeNode(aNode) {
  return _serializeDOMObject(aNode.ownerDocument, function (aEncoder) {
    aEncoder.setNode(aNode);
  });
}

/* This function is used to pretty print a selection inside a conversation area */
export function serializeSelection(aSelection) {
  // We have two kinds of selection serialization:
  //  - The short version, used when only a part of message is
  //    selected, or if nothing interesting is selected
  let shortSelection = "";

  //  - The long version, which is used:
  //      * when both some of the message text and some of the context
  //        (sender, time, ...) is selected;
  //      * when several messages are selected at once
  //    This version uses an array, with each message formatted
  //    through the theme system.
  const longSelection = [];

  // We first assume that we are going to use the short version, but
  // while working on creating the short version, we prepare
  // everything to be able to switch to the long version if we later
  // discover that it is in fact needed.
  let shortVersionPossible = true;

  // Sometimes we need to know if a selection range is inside the same
  // message as the previous selection range, so we keep track of the
  // last message we have processed.
  let lastMessage = null;

  for (let i = 0; i < aSelection.rangeCount; ++i) {
    const range = aSelection.getRangeAt(i);
    let messages = getMessagesForRange(range);

    // If at least one selected message has some of its text selected,
    // remove from the selection all the messages that have no text
    // selected
    const testFunction = msg => msg.isTextSelected();
    if (messages.some(testFunction)) {
      messages = messages.filter(testFunction);
    }

    if (!messages.length) {
      // Do it only if it wouldn't override a better already found selection
      if (!shortSelection) {
        shortSelection = serializeRange(range);
      }
      continue;
    }

    if (
      shortVersionPossible &&
      messages.length == 1 &&
      (!messages[0].isTextSelected() || messages[0].onlyTextSelected()) &&
      (!lastMessage ||
        lastMessage.msg == messages[0].msg ||
        lastMessage.msg.who == messages[0].msg.who)
    ) {
      if (shortSelection) {
        if (lastMessage.msg != messages[0].msg) {
          // Add the ellipsis only if the previous message was cut
          if (lastMessage.cutEnd) {
            shortSelection += " " + getEllipsis();
          }
          shortSelection += kLineBreak;
        } else {
          shortSelection += " " + getEllipsis() + " ";
        }
      }
      shortSelection += serializeRange(range);
      longSelection.push(messages[0].getFormattedMessage());
    } else {
      shortVersionPossible = false;
      for (let m = 0; m < messages.length; ++m) {
        const message = messages[m];
        if (m == 0 && lastMessage && lastMessage.msg == message.msg) {
          let text = message.getSelectedText();
          if (message.cutEnd) {
            text += " " + getEllipsis();
          }
          longSelection[longSelection.length - 1] += " " + text;
        } else {
          longSelection.push(message.getFormattedMessage());
        }
      }
    }
    lastMessage = messages[messages.length - 1];
  }

  if (shortVersionPossible) {
    return shortSelection || aSelection.toString();
  }
  return longSelection.join(kLineBreak);
}

function SelectedMessage(aRootNode, aRange) {
  this._rootNodes = [aRootNode];
  this._range = aRange;
}

SelectedMessage.prototype = {
  get msg() {
    return this._rootNodes[0]._originalMsg;
  },
  addRoot(aRootNode) {
    this._rootNodes.push(aRootNode);
  },

  // Helper function that returns the first span node of class
  // ib-msg-text under the rootNodes of the selected message.
  _getSpanNode() {
    // first use the cached value if any
    if (this._spanNode) {
      return this._spanNode;
    }

    let spanNode = null;
    // If we could use NodeFilter.webidl, we wouldn't have to make up our own
    // object. FILTER_REJECT is not used here, but included for completeness.
    // eslint-disable-next-line no-shadow
    const NodeFilter = {
      SHOW_ELEMENT: 0x1,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3,
    };
    // helper filter function for the tree walker
    const filter = function (node) {
      return node.className == "ib-msg-txt"
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    };
    // walk the DOM subtrees of each root, keep the first correct span node
    for (let i = 0; !spanNode && i < this._rootNodes.length; ++i) {
      const rootNode = this._rootNodes[i];
      // the TreeWalker doesn't test the root node, special case it first
      if (filter(rootNode) == NodeFilter.FILTER_ACCEPT) {
        spanNode = rootNode;
        break;
      }
      const treeWalker = rootNode.ownerDocument.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_ELEMENT,
        { acceptNode: filter },
        false
      );
      spanNode = treeWalker.nextNode();
    }

    return (this._spanNode = spanNode);
  },

  // Initialize _textSelected and _otherSelected; if _textSelected is true,
  // also initialize _selectedText and _cutBegin/End.
  _initSelectedText() {
    if ("_textSelected" in this) {
      // Already initialized.
      return;
    }

    const spanNode = this._getSpanNode();
    if (!spanNode) {
      // can happen if the message text is under a separate root node
      // that isn't selected at all
      this._textSelected = false;
      this._otherSelected = true;
      return;
    }
    const startPoint = this._range.comparePoint(spanNode, 0);
    // Note that we are working on the HTML DOM, including text nodes,
    // so we need to use childNodes here and below.
    const endPoint = this._range.comparePoint(
      spanNode,
      spanNode.childNodes.length
    );
    if (startPoint <= 0 && endPoint >= 0) {
      const range = this._range.cloneRange();
      if (startPoint >= 0) {
        range.setStart(spanNode, 0);
      }
      if (endPoint <= 0) {
        range.setEnd(spanNode, spanNode.childNodes.length);
      }
      this._selectedText = serializeRange(range);

      // if the selected text is empty, set _selectedText to false
      // this happens if the carret is at the offset 0 in the span node
      this._textSelected = this._selectedText != "";
    } else {
      this._textSelected = false;
    }
    if (this._textSelected) {
      // to check if the start or end is cut, the result of
      // comparePoint is not enough because the selection range may
      // start or end in a text node instead of the span node

      if (startPoint == -1) {
        const range = spanNode.ownerDocument.createRange();
        range.setStart(spanNode, 0);
        range.setEnd(this._range.startContainer, this._range.startOffset);
        this._cutBegin = serializeRange(range) != "";
      } else {
        this._cutBegin = false;
      }

      if (endPoint == 1) {
        const range = spanNode.ownerDocument.createRange();
        range.setStart(this._range.endContainer, this._range.endOffset);
        range.setEnd(spanNode, spanNode.childNodes.length);
        this._cutEnd = !/^(\r?\n)?$/.test(serializeRange(range));
      } else {
        this._cutEnd = false;
      }
    }
    this._otherSelected =
      (startPoint >= 0 || endPoint <= 0) && // eliminate most negative cases
      (!this._textSelected ||
        serializeRange(this._range).length > this._selectedText.length);
  },
  get cutBegin() {
    this._initSelectedText();
    return this._textSelected && this._cutBegin;
  },
  get cutEnd() {
    this._initSelectedText();
    return this._textSelected && this._cutEnd;
  },
  isTextSelected() {
    this._initSelectedText();
    return this._textSelected;
  },
  onlyTextSelected() {
    this._initSelectedText();
    return !this._otherSelected;
  },
  getSelectedText() {
    this._initSelectedText();
    return this._textSelected ? this._selectedText : "";
  },
  getFormattedMessage() {
    // First, get the selected text
    this._initSelectedText();
    const msg = this.msg;
    let text;
    if (this._textSelected) {
      // Add ellipsis is needed
      text =
        (this._cutBegin ? getEllipsis() + " " : "") +
        this._selectedText +
        (this._cutEnd ? " " + getEllipsis() : "");
    } else {
      const div = this._rootNodes[0].ownerDocument.createElement("div");
      const divChildren = getDocumentFragmentFromHTML(
        div.ownerDocument,
        msg.autoResponse ? formatAutoResponce(msg.message) : msg.message
      );
      div.appendChild(divChildren);
      text = serializeNode(div);
    }

    // then get the suitable template for this message
    let template;
    if (msg.system) {
      template = lazy.l10n.formatValueSync(
        "messenger-conversations-selections-system-messages-template"
      );
    } else if (msg.action) {
      template = lazy.l10n.formatValueSync(
        "messenger-conversations-selections-action-messages-template"
      );
    } else {
      template = lazy.l10n.formatValueSync(
        "messenger-conversations-selections-content-messages-template"
      );
    }

    return template
      .replace("%time%", formatTime(msg))
      .replace("%sender%", msg.alias || msg.who)
      .replace("%message%", text);
  },
};

export function getMessagesForRange(aRange) {
  const result = []; // will hold the final result
  const messages = {}; // used to prevent duplicate messages in the result array

  // cache the range boundaries, they will be used a lot
  const endNode = aRange.endContainer;
  let startNode = aRange.startContainer;

  // Helper function to recursively look for _originalMsg JS
  // properties on DOM nodes, and stop when endNode is reached.
  // Found nodes are pushed into the rootNodes array.
  const processSubtree = function (aNode) {
    if (aNode._originalMsg) {
      // store the result
      if (!(aNode._originalMsg.id in messages)) {
        // we've found a new message!
        const newMessage = new SelectedMessage(aNode, aRange);
        messages[aNode._originalMsg.id] = newMessage;
        result.push(newMessage);
      } else {
        // we've found another root of an already known message
        messages[aNode._originalMsg.id].addRoot(aNode);
      }
    }

    // check if we have reached the end node
    if (aNode == endNode) {
      return true;
    }

    // recurse through children
    if (
      aNode.nodeType == aNode.ELEMENT_NODE &&
      aNode.namespaceURI == "http://www.w3.org/1999/xhtml"
    ) {
      for (let i = 0; i < aNode.children.length; ++i) {
        if (processSubtree(aNode.children[i])) {
          return true;
        }
      }
    }

    return false;
  };

  const currentNode = aRange.commonAncestorContainer;
  if (
    currentNode.nodeType == currentNode.ELEMENT_NODE &&
    currentNode.namespaceURI == "http://www.w3.org/1999/xhtml"
  ) {
    // Determine the index of the first and last children of currentNode
    // that we should process.
    let found = false;
    let start = 0;
    if (currentNode == startNode) {
      // we want to process all children
      found = true;
      start = aRange.startOffset;
    } else {
      // startNode needs to be a direct child of currentNode
      while (startNode.parentNode != currentNode) {
        startNode = startNode.parentNode;
      }
    }
    let end;
    if (currentNode == endNode) {
      end = aRange.endOffset;
    } else {
      end = currentNode.children.length;
    }

    for (let i = start; i < end; ++i) {
      const node = currentNode.children[i];

      // don't do anything until we find the startNode
      found = found || node == startNode;
      if (!found) {
        continue;
      }

      if (processSubtree(node)) {
        break;
      }
    }
  }

  // The selection may not include any root node of the first touched
  // message, in this case, the DOM traversal of the DOM range
  // couldn't give us the first message. Make sure we actually have
  // the message in which the range starts.
  let firstRoot = aRange.startContainer;
  while (firstRoot && !firstRoot._originalMsg) {
    firstRoot = firstRoot.parentNode;
  }
  if (firstRoot && !(firstRoot._originalMsg.id in messages)) {
    result.unshift(new SelectedMessage(firstRoot, aRange));
  }

  return result;
}

/**
 * Turns a raw HTML string into a DocumentFragment usable in the provided
 * document.
 *
 * @param {Document} doc - The Document the fragment will belong to.
 * @param {string} html  - The target HTML to be parsed.
 *
 * @returns {DocumentFragment}
 */
export function getDocumentFragmentFromHTML(doc, html) {
  const uri = Services.io.newURI(doc.baseURI);
  const flags = Ci.nsIParserUtils.SanitizerAllowStyle;
  const context = doc.createElement("div");
  return ParserUtils.parseFragment(html, flags, false, uri, context);
}

/**
 * Get all nodes that make up the given message if any.
 *
 * @param {string} remoteId - Remote ID of the message to get
 * @param {Document} doc - Document the message is in.
 * @returns {NodeList} Node list of all the parts of the message, or an empty
 *  list if the message is not found.
 */
function getExistingMessage(remoteId, doc) {
  const parent = doc.getElementById("Chat");
  return parent.querySelectorAll(`[data-remote-id="${CSS.escape(remoteId)}"]`);
}
