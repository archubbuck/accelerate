# @accelerate/authentication-react

React authentication context and hook. Provide a client that resolves the authenticated session through your backend. Do not place long-lived bearer tokens in browser storage.

```tsx
<AuthenticationProvider client={client}><App /></AuthenticationProvider>
// In a child component:
const { context, loading, signOut } = useAuthentication();
```
