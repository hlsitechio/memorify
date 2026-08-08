# Domain: memorify.dev

Informational WHOIS/RDAP snapshot (ICANN / Name.com / Google Registry).  
Captured: **2026-08-08** (user-provided RDAP).

## Summary

| Field | Value |
|--------|--------|
| Domain | `memorify.dev` |
| Registry Domain ID | `E155196B4-DEV` |
| Status | **active** |
| Created | 2026-05-15 00:36:38 UTC |
| Registry / Registrar expiration | **2027-05-15 00:36:38 UTC** |
| Last updated (RDAP) | 2026-08-08 03:25:10 UTC |
| Registrar | Name.com, Inc (IANA ID **625**) |
| Abuse email | abuse@name.com |
| Abuse phone | +1-720-310-1849 |

## Nameservers (public — as of this snapshot)

```text
ns1hwy.name.com
ns2fln.name.com
```

**Implication:** DNS is still on **Name.com**, not Netlify DNS.  
Until NS are switched to Netlify:

```text
dns1.p04.nsone.net
dns2.p04.nsone.net
dns3.p04.nsone.net
dns4.p04.nsone.net
```

…custom domain SSL on Netlify stays blocked (`bad dns for custom domain` / “doesn't appear to be served by Netlify”).

Canonical Netlify zone records (once NS delegated): see project DNS CSV / `ARCHITECTURE.md`.

## Registrant (RDAP)

| Field | Value |
|--------|--------|
| Handle | 1-NAME |
| Name | Hubert Larose Surprenant |
| Organization | methoraai |
| Email | hlarosesurprenant@gmail.com |
| Phone | +1-514-371-8022 |
| Address | 343-7 rue Hubert, Greenfield Park, QC, J4V 1R9 |
| Country | CA |

## DNSSEC

| Field | Value |
|--------|--------|
| Zone Signed | Signed |
| Delegation Signed | **Unsigned** |

## RDAP sources

- Registry: https://pubapi.registry.google/rdap/domain/memorify.dev  
- Registrar: https://namerdap.systems/domain/memorify.dev  
- Last pulled from registry/registrar RDAP DB (per notice): 2026-08-08T15:02:05.387Z  

## Notices (abbreviated)

- Standard ICANN status-code info: https://icann.org/epp  
- RDDS inaccuracy form: https://icann.org/wicf  
- Name.com RDAP terms: data for lawful use only; not for spam/high-volume abuse; not authoritative vs EPP SRS.  
- Layered access for privacy-redacted data: https://www.name.com/layered-access-request  

## Ops link

Production app (until custom domain DNS is fixed):  
`https://memorify-dev.netlify.app`  

Stack: GitHub + Netlify Edge + Neon — see [ARCHITECTURE.md](../ARCHITECTURE.md).
