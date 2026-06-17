console.log('--- DEBUG: POS checkout diagnostics loaded ---');
window.addEventListener('load', () => {
  setTimeout(() => {
    console.log('--- DEBUG: Running POS diagnostics ---');
    console.log('window.RS:', window.RS ? 'Defined' : 'Undefined');
    console.log('window.RSPOS:', window.RSPOS ? 'Defined' : 'Undefined');
    if (window.RSPOS) {
      console.log('window.RSPOS.checkout:', typeof window.RSPOS.checkout);
    }
    const btn = document.getElementById('btn-checkout');
    console.log('Button (#btn-checkout) element:', btn ? 'Found' : 'Not Found');
    if (btn) {
      console.log('Button onclick handler:', btn.onclick ? btn.onclick.toString() : 'None');
    }
  }, 2000);
});
