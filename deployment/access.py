"""A small browser login gate for the cloud demonstration."""
import hmac
import os

from flask import Response, request


def protect_cloud_site(app):
    if os.getenv("DEPLOYMENT_MODE") != "cloud-test":
        return
    username = os.environ.get("SITE_USERNAME", "")
    password = os.environ.get("SITE_PASSWORD", "")
    if not username or len(password) < 4:
        raise RuntimeError("Cloud demo requires a username and a site password of at least four characters.")

    @app.before_request
    def authenticate():
        if request.path == "/healthz":
            return None
        auth = request.authorization
        if (auth and auth.type.lower() == "basic"
                and hmac.compare_digest((auth.username or "").encode(), username.encode())
                and hmac.compare_digest((auth.password or "").encode(), password.encode())):
            return None
        return Response("Please sign in to the test system.", 401,
                        {"WWW-Authenticate": 'Basic realm="Feedback test", charset="UTF-8"',
                         "Cache-Control": "no-store"})

    @app.after_request
    def private_responses(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
