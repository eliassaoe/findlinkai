import { instantly } from './instantly.mjs';
import { smartlead } from './smartlead.mjs';
import { lemlist } from './lemlist.mjs';
import { reply } from './reply.mjs';
import { woodpecker } from './woodpecker.mjs';
import { activecampaign } from './activecampaign.mjs';
import { outreach } from './outreach.mjs';
import { salesloft } from './salesloft.mjs';
import { salesforge } from './salesforge.mjs';
import { emailbison } from './emailbison.mjs';
import { clay } from './clay.mjs';
import { justcall } from './justcall.mjs';

export const DESTINATIONS = {
    activecampaign,
    clay,
    emailbison,
    instantly,
    justcall,
    lemlist,
    outreach,
    reply,
    salesforge,
    salesloft,
    smartlead,
    woodpecker,
};

export function getDestination(id) {
    const destination = DESTINATIONS[id];
    if (!destination) {
        throw new Error(`Unknown outreach destination "${id}". Known: ${Object.keys(DESTINATIONS).join(', ')}.`);
    }
    return destination;
}
