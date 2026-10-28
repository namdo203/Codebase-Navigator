const form = document.querySelector("#analysis-form");
const repositoryInput = document.querySelector("#repository");
const questionInput = document.querySelector("#question");
const button = document.querySelector("#analyze-button");
const status = document.querySelector("#status");
const errorMessage = document.querySelector("#error");
const results = document.querySelector("#results");
const answer = document.querySelector("#answer");
const sources = document.querySelector("#sources");
const noSources = document.querySelector("#no-sources");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = "Cloning repository and analyzing codebase...";
  errorMessage.hidden = true;
  results.hidden = true;
  answer.textContent = "";
  sources.replaceChildren();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository: repositoryInput.value,
        question: questionInput.value,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "The analysis request failed.");
    }

    answer.textContent = result.answer;
    for (const source of result.sources) {
      const item = document.createElement("li");
      item.textContent = `${source.filePath}:${source.startLine}\u2013${source.endLine}`;
      sources.append(item);
    }
    noSources.hidden = result.sources.length > 0;
    results.hidden = false;
  } catch (error) {
    errorMessage.textContent = error.message || "Could not connect to the analysis server.";
    errorMessage.hidden = false;
  } finally {
    button.disabled = false;
    status.textContent = "";
  }
});
