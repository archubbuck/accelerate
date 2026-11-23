# @accelerate/authentication-angular

Angular signal-based authentication service. Provide `AUTHENTICATION_CLIENT` in your application providers and call `AuthenticationService.refresh()` during startup. The client must fetch the session from your backend, not infer authentication from locally stored claims.
