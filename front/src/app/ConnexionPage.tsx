/**
 * /connexion — the door to the account. An address proven by the Ledger is the account: no e-mail, no password.
 * Once the bench says we are logged in, the page hands over to the account page that sent us here (or the overview).
 */
import { useEffect } from 'react'
import { useBench } from './useBench'
import { navigate, takeNext } from './router'
import { DeviceBand } from './AppareilPage'
import { Band, Panel, Row, Skeleton } from './ui'

export function ConnexionPage() {
  const { state } = useBench()
  const address = state?.address
  useEffect(() => { if (address) navigate(takeNext(), '', true) }, [address])

  if (!state) return <div className="app-column pt-12"><Skeleton rows={6} /></div>
  return (
    <>
      <Band
        eyebrow="Connexion"
        title="Votre Ledger est votre compte"
        lead="Pas d’adresse e-mail, pas de mot de passe. Vous signez un message sur votre appareil ; l’adresse qu’il prouve devient votre compte, avec votre coffre, vos agents et vos données."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel kicker="1 · L’appareil" title="Une vraie Ledger, ou la Flex émulée">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Une Ledger branchée en USB (Chrome, Edge ou Brave), ou la Flex émulée du banc. Le même code, les mêmes écrans, la même
              signature.
            </p>
          </Panel>
          <Panel kicker="2 · La signature" title="Un message, lu sur l’écran">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Sign-In with Ethereum : un message court, signé sur l’appareil dans ce navigateur, vérifié par le serveur. Il ne
              coûte rien et n’autorise rien d’autre que l’ouverture de votre compte.
            </p>
          </Panel>
          <Panel kicker="3 · Votre espace" title="Tout ce qui est à vous">
            <Row label="Mon coffre" value="un contrat à mon nom" />
            <Row label="Mes agents de trading" value="sous mon mandat" />
            <Row label="Mon agent d’analyse" value="en lecture seule" />
            <Row label="Ma clé MCP" value="dérivée de mon adresse" />
          </Panel>
        </div>
      </Band>
      <DeviceBand />
    </>
  )
}
