
## Draw the boundaries first

Before anything else, draw the system and mark where trust changes. In a typical assistant that is: the user's input, whatever documents get retrieved, the model itself, any tools the model can invoke, and wherever the output ends up rendered.

Once it is drawn, one fact dominates everything else. The model receives instructions and data in the same channel, as text, with no reliable way to distinguish them. Every other problem on this list is a consequence of that.

## Prompt injection is not a filtering problem

Prompt injection is when text the model reads causes it to do something the operator did not intend. Direct injection is a user typing "ignore your instructions." That one is mostly a nuisance, because the user is only attacking their own session.

Indirect injection is the serious one. The model reads a web page, a support ticket, a code comment, a PDF, or a calendar invite that contains instructions, and it follows them. The attacker never touches your application. They just leave text where your system will pick it up.

People try to solve this with a blocklist of phrases. It does not work, and it is worth understanding why: there are unlimited paraphrases, the content can be in another language, encoded, or split across documents, and you are trying to filter natural language with pattern matching. Treat mitigation as reducing blast radius, not as prevention.

The system prompt is not a security control either. It is a suggestion with good odds, and odds are not a boundary.

## Tool calling turns text into actions

A model that only produces text has limited consequences. A model that can call functions is now an authenticated actor in your system, and the classic confused deputy problem applies directly: it holds privileges the person or document influencing it should not have.

The rules I would hold to:

The model's tools run with the requesting user's permissions, never with a service account that can see everything. If the user cannot read that record, neither can the model on their behalf.

Anything destructive or externally visible requires human confirmation, and the confirmation must show what will actually happen, not a model generated summary of it. Sending, deleting, paying, merging, and posting all qualify.

Tool inputs are validated like any other untrusted input, because that is what they are. The model is a very fluent user of your API and it will produce arguments no human would.

```python
ALLOWED = {"search_docs", "get_ticket", "list_files"}   # read only by default
CONFIRM = {"send_email", "delete_file", "create_pr"}

def dispatch(call, ctx):
    if call.name not in ALLOWED | CONFIRM:
        raise PermissionError(f"tool not permitted: {call.name}")
    args = SCHEMAS[call.name].validate(call.args)      # reject, do not coerce
    if not ctx.user.can(call.name, args):              # user's rights, not the app's
        raise PermissionError("caller lacks permission")
    if call.name in CONFIRM:
        return ctx.request_human_approval(call.name, args)
    return TOOLS[call.name](**args, as_user=ctx.user)
```

The important detail is `as_user`. If your tools run as the application, an injected instruction has the application's full reach.

## Output is an untrusted string

Model output is attacker influenceable text, so handle it the way you handle any attacker influenceable text.

Rendering it as HTML without sanitizing gives you cross site scripting. Passing it to a shell gives you command injection. Concatenating it into SQL gives you SQL injection. Emitting a markdown image whose URL contains conversation content exfiltrates data the moment the client fetches it, with no click required.

None of these are new vulnerability classes. They are the old ones with a new source, which is good news, because the existing defenses work: escape on output, parameterize queries, never build shell strings, and restrict which hosts rendered content may load from.

## The retrieval layer leaks

If your assistant retrieves from a shared corpus, access control has to be enforced in the retrieval query, not by asking the model to be discreet. Filter by the caller's permissions in the search itself, and re check on the way out.

Two subtler leaks. Documents get indexed once with the permissions they had at the time, so revocations need to propagate into the index. And an attacker who can add content to the corpus can plant injected instructions for other users to retrieve later, which makes "who can write to the knowledge base" a security question.

## What I would actually build

Least privilege on every tool, scoped to the requesting user. Read only by default, with an explicit allowlist for anything else. Human confirmation on irreversible actions, showing real parameters. Output treated as untrusted at every sink. Access control enforced in retrieval. Rate limits and spend caps, because an injected loop is also a billing incident. And full logging of prompts, retrieved sources, tool calls, and arguments, because without that you cannot investigate anything.

None of that stops injection. It means a successful injection reads a document it should not have rather than emptying an account, and that is the realistic goal today.

## References

- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
