# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords, S-PINs, VINs and addresses
  first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes, in
particular:

- the secrets of the configuration (MySkoda password and S-PIN), stored by
  Gladys and passed to the container; they must never reach a log line, a
  file or another host than the VW Group sign-in service and the MySkoda
  cloud;
- `/data/myskoda.json`, the only file the integration writes: the access and
  refresh tokens of the MySkoda cloud (a refresh token opens the account for
  about six months), a salted fingerprint of the credentials, and per car the
  list of the values it reports — written with mode 0600;
- the network: outbound HTTPS only, to `identity.vwgroup.io` and
  `mysmob.api.connect.skoda-auto.cz`; the integration listens on no port;
- the commands: unlocking must stay off unless the user turned it on, and the
  S-PIN must never be sent again once refused.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the services of Škoda Auto and of the VW Group the integration talks to.
