
## Start from the right premise

Here is the sentence that makes the rest of this straightforward: **the model is not a security boundary.**

A language model takes text and produces text. It cannot reliably distinguish instructions you wrote from instructions embedded in data it was handed, because at the token level there is no distinction. Any control that depends on the model choosing to obey your system prompt over attacker supplied text is a control you cannot rely on.

That is not a defeatist position. It just relocates the security work to where it belongs: the boundaries around the model.

## Prompt injection is a data flow problem

Direct prompt injection is a user typing "ignore your instructions". That is the boring case, and it mostly only harms the user themselves.

Indirect prompt injection is the real one. Your application retrieves a document, fetches a web page, reads an email, or parses a support ticket, and that content contains instructions. The model has no way to know that text is data rather than direction. Now attacker text is influencing an application that is authenticated as your user.

Draw the data flow. Every arrow that brings text from somewhere you do not control into the prompt is an injection vector. In most real systems there are more of these than people expect: file uploads, scraped pages, third party API responses, tool outputs, even the model's own prior turns after it has been influenced once.

## Tools turn text into actions

A model that only emits text into a chat window has limited blast radius. The moment you give it tools, generated text becomes function calls, and every tool is a capability an attacker may be able to reach by getting text into the context.

So treat the tool layer like an authorization layer, because it is one.

```python
ALLOWED_TOOLS = {
    "search_docs":   {"side_effects": False, "confirm": False},
    "read_ticket":   {"side_effects": False, "confirm": False},
    "post_comment":  {"side_effects": True,  "confirm": True},
    "close_ticket":  {"side_effects": True,  "confirm": True},
}

def authorize(call, user, session):
    spec = ALLOWED_TOOLS.get(call.name)
    if spec is None:
        raise PermissionError(f"tool not in allowlist: {call.name}")

    # Authorization is checked against the human, never against the model.
    if not user.can(call.name, call.args.get("resource_id")):
        raise PermissionError(f"{user.id} lacks permission for {call.name}")

    # Anything with side effects gets an explicit human confirmation,
    # and the confirmation shows the resolved arguments, not the intent.
    if spec["side_effects"] and not session.confirmed(call.fingerprint()):
        raise ConfirmationRequired(call)

    audit.log(user=user.id, tool=call.name, args=call.args,
              session=session.id, source="model")
    return call
```

Three rules encoded there. Tools are an explicit allowlist, never a dynamic dispatch on whatever name the model produced. Permission is evaluated against the authenticated human, never inherited from the service account. Side effecting actions require a human to see the actual resolved arguments and approve them.

## Trust the output like you trust user input

Model output is untrusted input to whatever consumes it next. This gets forgotten constantly because the output feels like it came from your own system.

If you render it as HTML or markdown, you have a cross site scripting sink. Sanitize it, and remember that markdown images and links can carry an attacker controlled URL, which is a quiet exfiltration channel: the model is convinced to embed sensitive text into a URL, the client renders the image, the data leaves.

If it becomes a database query, parameterize it. If it becomes a shell command, do not. If it becomes a URL your backend fetches, you have built a server side request forgery primitive that an attacker can point at cloud metadata endpoints and internal services, so restrict outbound requests to an allowlist and block internal address ranges.

## Retrieval is an exfiltration path

In a multi tenant retrieval system, the access control decision must happen in the query, as a filter the search engine enforces, not as an instruction in the prompt telling the model which documents it may use.

I have seen "only answer using documents belonging to the current customer" written in a system prompt, with the retriever returning everything. That is not access control. That is a request.

Filter at retrieval time on an identity derived from the authenticated session, and verify the filter in tests with a user who should see nothing.

## Cost, availability, and the controls that help

Two things static apps do not have to think about. Inference is expensive per request, so an unauthenticated or unmetered endpoint is a direct financial denial of service. And a long context request with a large generation can occupy a serving slot for a long time, so a handful of them can starve everyone else.

Rate limit per authenticated user, cap max tokens in and out, cap tool call iterations per request so an agent loop cannot run forever, and set a hard wall clock timeout.

Putting it together, the controls I would actually build are these. Least privilege on every credential the application holds, scoped to the human on whose behalf it is acting. Egress filtering, so a compromised prompt cannot reach arbitrary destinations. An allowlist of tools with confirmation on anything destructive. Output sanitization at every rendering point. Retrieval filtered by identity at query time. Full audit logging of prompts, retrieved context, tool calls, and results, so an incident is investigable. And limits on tokens, iterations, and time.

Notice how little of that is AI specific. It is input validation, least privilege, output encoding, and logging. The novel part is only that the untrusted input can arrive through a channel that looks like your own configuration.

## References

- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [MITRE ATLAS](https://atlas.mitre.org/)
