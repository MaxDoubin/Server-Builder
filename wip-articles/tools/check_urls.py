"""Check every https URL in a draft (inline links and references). Prints status per URL."""
import re, ssl, sys, urllib.request, concurrent.futures as cf
ctx = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
def status(url):
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
            with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
                return r.status, r.geturl()
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405, 400, 404, 429, 500, 501): continue
            return e.code, url
        except Exception as e:
            if method == "HEAD": continue
            return type(e).__name__, url
    return "?", url
text = open(sys.argv[1]).read()
urls = sorted(set(u.rstrip(").,") for u in re.findall(r"https://[^\s)\"<>]+", text)))
with cf.ThreadPoolExecutor(8) as ex:
    for url, (st, final) in zip(urls, ex.map(status, urls)):
        flag = "OK " if st == 200 else "!! "
        print(f"{flag}{st}  {url}" + (f"  -> {final}" if final != url and st == 200 and final.rstrip('/') != url.rstrip('/') else ""))
