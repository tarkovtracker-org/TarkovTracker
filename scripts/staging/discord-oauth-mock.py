"""Synthetic OAuth provider for disposable GoTrue transport tests. No real Discord calls."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import parse_qs,urlparse
import json
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,body,status=200):
  data=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path!='/api/oauth2/token':return self.respond({'error':'unknown_mock_route'},404)
  values=parse_qs(self.rfile.read(int(self.headers.get('Content-Length','0'))).decode())
  return self.respond({'access_token':values.get('code',[''])[0],'token_type':'Bearer','expires_in':3600})
 def do_GET(self):
  if self.path!='/api/users/@me':return self.respond({'error':'unknown_mock_route'},404)
  token=self.headers.get('Authorization','').removeprefix('Bearer ')
  parts=token.split(':',1)
  if len(parts)!=2:return self.respond({'error':'invalid_synthetic_token'},400)
  return self.respond({'id':parts[0],'email':parts[1],'verified':True,'username':'synthetic-discord','discriminator':'0001','avatar':None})
ThreadingHTTPServer(('0.0.0.0',59400),Handler).serve_forever()
