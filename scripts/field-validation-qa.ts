import assert from 'node:assert/strict';
import { RESOURCES } from '../src/lib/resources';
import { validateFields } from '../src/lib/field-validation';
import { financialTotalsPatch } from '../src/lib/financial';
for (const def of RESOURCES) {
  for (const field of def.fields.filter(f=>f.required && !f.readOnly)) {
    const result = validateFields({fields:[field]}, {[field.key]:'   '});
    assert.ok(result.errors[field.key], `${def.id}.${field.key} must reject whitespace`);
  }
}
const fields:any[]=[{key:'name',label:'Name',type:'text',required:true},{key:'date',label:'Date',type:'date'}, {key:'value',label:'Value',type:'number'}, {key:'active',label:'Active',type:'boolean'}, {key:'email',label:'Email',type:'email'}];
for(const [key,value] of [['date','2026-02-30'],['value','Infinity'],['value',{}],['active','anything'],['email','not-an-email']] as const) assert.ok(validateFields({fields},{name:'Good',[key]:value}).errors[key], key);
const valid=validateFields({fields},{name:'  Example  ',date:'2024-02-29',value:0,active:false,email:'a@example.com'});
assert.equal(valid.ok,true); assert.equal(valid.clean.name,'Example'); assert.equal(valid.clean.value,0); assert.equal(valid.clean.active,false);
console.log(`Field contract checks passed across ${RESOURCES.length} resource definitions`);
const items:any={fields:[{key:'items',label:'Items',type:'items'}]};
assert.ok(validateFields(items,{items:[{description:'Work',qty:2,unitPrice:100,total:1}]}).errors.items);
assert.ok(validateFields(items,{items:[{description:'Work',qty:-1,unitPrice:100,total:-100}]}).errors.items);
assert.equal(validateFields(items,{items:[{description:'Work',qty:0,unitPrice:100,total:0}]}).clean.items[0].qty,0);
assert.equal(validateFields(items,{items:[{description:'Work',qty:2,unitPrice:100,total:200}]}).ok,true);

assert.equal(financialTotalsPatch('arInvoices',{vatPct:15},[{description:'Free item',detail:'',qty:0,unitPrice:100,total:0}]).total,0);
