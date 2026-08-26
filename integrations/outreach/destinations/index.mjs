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

export const DESTINATIONS = {
    activecampaign,
    emailbison,
    instantly,
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
