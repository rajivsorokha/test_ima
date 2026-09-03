const XEOSCAPE_LICENSE_TEXT = `XEOSCAPE SOFTWARE LICENSE AGREEMENT

Software: Ima Langnubi Dairy — Farm & Milk Network Manager
Licensor: Xeoscape
Licensee: Ima Langnubi Dairy, Thangmeiband Sinam Leikai, Imphal, Manipur

1. GRANT OF LICENSE
Xeoscape grants Ima Langnubi Dairy a non-exclusive, non-transferable license
to install and use this software on the Licensee's own hardware, solely for
the internal operation of the Licensee's dairy business (herd management,
milk collection, point of sale, financial records, staff records, and
related reporting).

2. OWNERSHIP
This software, including its source code, design, and branding, remains the
property of Xeoscape. This agreement does not transfer ownership of the
software to the Licensee.

3. RESTRICTIONS
The Licensee may not resell, sublicense, or redistribute this software to
third parties without Xeoscape's prior written consent. The Licensee may
modify its own deployment for internal use.

4. DATA OWNERSHIP
All business data entered into the software by the Licensee (cows, milk
records, sales, financial transactions, employee records, etc.) remains the
sole property of Ima Langnubi Dairy. Xeoscape claims no ownership over this
data.

5. WARRANTY DISCLAIMER
This software is provided "as is," without warranty of any kind, express or
implied, including but not limited to warranties of merchantability or
fitness for a particular purpose.

6. LIMITATION OF LIABILITY
In no event shall Xeoscape be liable for any indirect, incidental, or
consequential damages arising from the use of, or inability to use, this
software.

7. COPYRIGHT
© ${new Date().getFullYear()} Xeoscape. All rights reserved.
`;

function openLicenseModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:520px; max-width:92vw;">
      <h2>License Agreement</h2>
      <pre class="license-text">${XEOSCAPE_LICENSE_TEXT}</pre>
      <div class="modal-actions"><button type="button" class="primary" id="closeLicenseBtn">Close</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#closeLicenseBtn').addEventListener('click', () => overlay.remove());
}

document.querySelectorAll('.cyear, #copyrightYear').forEach(el => { el.textContent = new Date().getFullYear(); });

const viewLicenseLink = document.getElementById('viewLicenseLink');
if (viewLicenseLink) {
  viewLicenseLink.addEventListener('click', (e) => { e.preventDefault(); openLicenseModal(); });
}
