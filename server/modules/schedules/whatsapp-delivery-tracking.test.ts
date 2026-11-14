import { describe, it, expect } from 'vitest';
import { deliveryEventKey, parseDeliveryEvents } from './whatsapp-delivery-tracking';

describe('Meta delivery event handling',()=>{
 it('extracts only matching number and valid statuses without message contents',()=>{
  const payload={entry:[{changes:[{value:{metadata:{phone_number_id:'123'},statuses:[
   {id:'wamid.abc_123=',status:'delivered',timestamp:'1794482398',errors:[{code:123,title:'secret'}]},
   {id:'wamid.abc_123=',status:'read',timestamp:'1794482400'},
   {id:'wamid.invalid',status:'fake',timestamp:'1794482400'},
  ]}},{value:{metadata:{phone_number_id:'other'},statuses:[{id:'wamid.other',status:'read',timestamp:'1794482400'}]}}]}]};
  const events=parseDeliveryEvents(payload,'123');
  expect(events).toHaveLength(2); expect(events[0]).toEqual({messageId:'wamid.abc_123=',status:'delivered',occurredAt:new Date(1794482398*1000),errorCode:'123'});
  expect(events[1].status).toBe('read');
  expect(deliveryEventKey(events[0])).toBe(deliveryEventKey({...events[0]}));
  expect(deliveryEventKey(events[0])).not.toBe(deliveryEventKey(events[1]));
 });
 it('ignores malformed identifiers, timestamps and unrelated phone numbers',()=>{
  const event={id:'../../token',status:'sent',timestamp:'0'};
  expect(parseDeliveryEvents({entry:[{changes:[{value:{metadata:{phone_number_id:'123'},statuses:[event]}}]}]},'123')).toEqual([]);
 });
});
