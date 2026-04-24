import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FooterInfoBar } from "@/components/layout/FooterInfoBar";
import { Link } from "react-router-dom";

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-20 pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-heading text-3xl md:text-4xl text-foreground mb-6">
            TERMS & CONDITIONS
          </h1>
          
          <p className="text-muted-foreground text-sm mb-8">
            Last updated: {new Date().toLocaleDateString('en-IE', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="space-y-8 text-foreground">
            <section>
              <h2 className="font-heading text-xl text-primary mb-3">1. INTRODUCTION</h2>
              <p className="text-muted-foreground leading-relaxed">
                Welcome to Street Eatz Waterford. These terms and conditions govern your use of our website
                and ordering services. By accessing this website or placing an order, you agree to be bound by these terms.
                Street Eatz Waterford operates from Crystal Sports and Leisure Centre, Cork Rd, Ballynaneashagh,
                Waterford, X91 E6PX, Ireland.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                You may use this website only for lawful purposes and in accordance with these terms.
                You agree not to misuse the website, attempt to gain unauthorised access, or interfere with its operation.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">2. ORDERING & PAYMENT</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>All orders are subject to availability and confirmation.</li>
                <li>Prices are displayed in Euros (€) and include VAT where applicable.</li>
                <li>Menu items, prices and availability may change without prior notice.</li>
                <li>Payment is required at the time of ordering for online/card orders.</li>
                <li>Cash payments are accepted for in-person orders.</li>
                <li>Card payments are processed securely by our PCI-DSS compliant payment provider; we do not store full card details on our website.</li>
                <li>We reserve the right to refuse any order at our discretion.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">3. PRICING &amp; AVAILABILITY</h2>
              <p className="text-muted-foreground leading-relaxed">
                All prices are shown in Euros (€) and include VAT where applicable. We make every effort to ensure prices
                and product information are accurate, but errors may occasionally occur. If we discover an error in the
                price of an order you have placed, we will contact you and offer the option to confirm at the correct
                price or cancel for a full refund. Items are subject to availability and may be withdrawn at any time.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">4. COLLECTION & PICKUP</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Orders must be collected from our location at Crystal Sports and Leisure Centre, Cork Rd, Ballynaneashagh, Waterford, X91 E6PX.</li>
                <li>Please arrive at your designated pickup time to ensure food quality.</li>
                <li>You may be asked to show your order confirmation number.</li>
                <li>Uncollected orders may be disposed of after 30 minutes without refund.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                For full details, see our <Link to="/delivery-policy" className="text-primary hover:underline">Delivery Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">5. REFUNDS, CANCELLATIONS &amp; DELIVERY</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                In accordance with Irish consumer law:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Once an order has been confirmed and is being prepared, cancellations may not be possible.</li>
                <li>If you need to cancel, please contact us immediately at streeteatzwaterford@gmail.com.</li>
                <li>Refunds for food quality issues must be reported within 24 hours of collection.</li>
                <li>Refunds will be processed to the original payment method within 5-10 business days.</li>
                <li>For cash payments, refunds may be provided as store credit.</li>
                <li>Orders fulfilled by third-party couriers (e.g. Deliveroo, Just Eat) are governed by the courier's own terms once handed over.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                See our full{" "}
                <Link to="/refund-policy" className="text-primary hover:underline">Refund &amp; Cancellation Policy</Link>{" "}
                and{" "}
                <Link to="/delivery-policy" className="text-primary hover:underline">Delivery Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">6. ALLERGENS & DIETARY REQUIREMENTS</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our food may contain or come into contact with common allergens including but not limited to: 
                gluten, dairy, eggs, nuts, soy, and sesame. While we take precautions, we cannot guarantee 
                a completely allergen-free environment. Please inform us of any allergies when ordering, and 
                note that cross-contamination is possible. Consume at your own risk if you have severe allergies.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">7. LOYALTY PROGRAMME</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Loyalty stamps are earned on qualifying purchases.</li>
                <li>Rewards cannot be exchanged for cash.</li>
                <li>We reserve the right to modify or terminate the loyalty programme.</li>
                <li>Fraudulent activity will result in account termination.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">8. INTELLECTUAL PROPERTY</h2>
              <p className="text-muted-foreground leading-relaxed">
                All content on this website, including logos, images, and text, is the property of 
                Street Eatz Waterford and is protected by Irish and international copyright law. 
                Unauthorized reproduction or distribution is prohibited.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">9. LIABILITY DISCLAIMER</h2>
              <p className="text-muted-foreground leading-relaxed">
                To the fullest extent permitted by Irish law, Street Eatz Waterford shall not be liable 
                for any indirect, incidental, or consequential damages arising from the use of our services. 
                Our total liability shall not exceed the value of your order.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">10. GOVERNING LAW &mdash; IRELAND</h2>
              <p className="text-muted-foreground leading-relaxed">
                These terms are governed by the laws of Ireland. Any disputes shall be subject to the 
                exclusive jurisdiction of the Irish courts. Nothing in these terms affects your statutory 
                rights as a consumer under Irish and EU law.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">11. CONTACT</h2>
              <div className="mt-3 p-4 bg-card/50 border border-border rounded-lg">
                <p className="text-foreground font-semibold">Street Eatz Waterford</p>
                <p className="text-muted-foreground">Crystal Sports and Leisure Centre</p>
                <p className="text-muted-foreground">Cork Rd, Ballynaneashagh</p>
                <p className="text-muted-foreground">Waterford, X91 E6PX, Ireland</p>
                <p className="text-primary mt-2">streeteatzwaterford@gmail.com</p>
              </div>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">12. CHANGES TO TERMS</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to update these terms at any time. Changes will be effective 
                immediately upon posting to this website. Continued use of our services constitutes 
                acceptance of any modified terms.
              </p>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
      <FooterInfoBar />
    </div>
  );
};

export default TermsAndConditions;
