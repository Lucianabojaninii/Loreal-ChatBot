// The class-hosted Cloudflare Worker sends requests to OpenAI securely.
const WORKER_URL = "https://loreal-chatbot.lbojaniniriascos.workers.dev/";

// This instruction keeps the chatbot focused on safe, useful beauty advice.
const SYSTEM_PROMPT = `You are the L'Oréal Smart Beauty Advisor.

Only help with L'Oréal Group beauty products and topics, including makeup,
skincare, haircare, fragrance, personalized routines, and recommendations.
You may discuss brands such as L'Oréal Paris, Lancôme, Maybelline, Garnier,
Kérastase, CeraVe, and La Roche-Posay. Never invent products, ingredients,
availability, or product details. If you need more information to make a
recommendation, ask a follow-up question, such as the user's skin type, hair
type, concerns, preferences, or budget. Never provide a medical diagnosis or
replace advice from a qualified healthcare professional.

If a user asks about something unrelated to L'Oréal or beauty, politely refuse
in one or two sentences and steer them back to L'Oréal products, routines, or
recommendations.`;

// Keep the system instructions and the recent conversation for context.
const messages = [{ role: "system", content: SYSTEM_PROMPT }];

function keepRecentMessages() {
  if (messages.length > 21) {
    messages.splice(1, messages.length - 21);
  }
}

/* Find the parts of the page that the chatbot uses. */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const latestQuestion = document.getElementById("latestQuestion");
const latestQuestionText = document.getElementById("latestQuestionText");
const suggestionChips = document.getElementById("suggestionChips");

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function cleanQuestion(text) {
  return text.replace(/^[“”"']+|[“”"']+$/g, "").trim();
}

function formatInlineText(text) {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function formatAssistantReply(message) {
  const lines = escapeHtml(message).split("\n");
  const formattedLines = [];
  let openList = null;

  const closeList = () => {
    if (openList) {
      formattedLines.push(`</${openList}>`);
      openList = null;
    }
  };

  lines.forEach((line) => {
    const unorderedItem = line.match(/^-\s+(.+)/);
    const orderedItem = line.match(/^\d+\.\s+(.+)/);

    if (unorderedItem || orderedItem) {
      const listType = unorderedItem ? "ul" : "ol";
      const itemText = unorderedItem ? unorderedItem[1] : orderedItem[1];

      if (openList !== listType) {
        closeList();
        formattedLines.push(`<${listType}>`);
        openList = listType;
      }

      formattedLines.push(`<li>${formatInlineText(itemText)}</li>`);
      return;
    }

    closeList();
    formattedLines.push(line ? formatInlineText(line) : "<br>");
  });

  closeList();
  return formattedLines.join("<br>");
}

function addAssistantAvatar(messageElement) {
  const avatar = document.createElement("span");
  avatar.className = "assistant-avatar";
  avatar.textContent = "L";
  avatar.setAttribute("aria-hidden", "true");
  messageElement.appendChild(avatar);
}

// Add a message bubble while safely formatting assistant replies.
function showMessage(message, messageType) {
  const messageElement = document.createElement("div");
  messageElement.className = `msg ${messageType}`;

  if (messageType === "ai") {
    addAssistantAvatar(messageElement);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (messageType === "ai") {
    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = "L'Oréal Advisor";
    bubble.appendChild(label);
  }

  const text = document.createElement("div");
  text.innerHTML =
    messageType === "ai" ? formatAssistantReply(message) : escapeHtml(message);
  bubble.appendChild(text);
  messageElement.appendChild(bubble);
  chatWindow.appendChild(messageElement);
  scrollToNewestMessage();
}

function scrollToNewestMessage() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showTypingIndicator() {
  const typingMessage = document.createElement("div");
  typingMessage.className = "msg ai typing-message";
  typingMessage.id = "typingIndicator";
  addAssistantAvatar(typingMessage);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = `
    <span class="message-label">L'Oréal Advisor</span>
    <span class="typing-dots" aria-label="Typing">
      <span></span><span></span><span></span>
    </span>
  `;
  typingMessage.appendChild(bubble);
  chatWindow.appendChild(typingMessage);
  scrollToNewestMessage();
}

function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typingIndicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// Show a friendly greeting when the page first loads.
showMessage(
  "👋 Welcome to the L'Oréal Smart Beauty Advisor! How can I help you find the right products or routine today?",
  "ai",
);

// Fill the input with a chip's question and submit it like a regular message.
suggestionChips.addEventListener("click", (event) => {
  const chip = event.target.closest(".suggestion-chip");

  if (!chip) {
    return;
  }

  userInput.value = chip.dataset.question;
  chatForm.requestSubmit();
});

/* Send the user's question to the class-hosted Worker. */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = userInput.value.trim();

  if (!message) {
    return;
  }

  showMessage(message, "user");
  latestQuestionText.textContent = cleanQuestion(message);
  latestQuestion.hidden = false;
  suggestionChips.hidden = true;
  userInput.value = "";
  messages.push({ role: "user", content: message });
  keepRecentMessages();
  showTypingIndicator();

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error("The beauty advisor request failed.");
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;
    messages.push({ role: "assistant", content: reply });
    keepRecentMessages();

    removeTypingIndicator();
    showMessage(reply, "ai");
  } catch (error) {
    // Remove a failed user message so it is not kept as conversation context.
    messages.pop();
    removeTypingIndicator();
    showMessage(
      "I'm sorry, I couldn't connect right now. Please try again in a moment.",
      "ai",
    );
  }
});
