# Online Shop Checkout — Requirements Specification

This document describes the functional requirements for the checkout flow
of an online shop, covering the shopping cart, checkout steps, payment,
delivery, and order confirmation. It is a synthetic example used for demos
and evaluation.

## 1. Shopping Cart

### REQ-CO-01: Add to cart

The system shall allow a user to add a product to their cart from the
product page.

### REQ-CO-02: Item quantity limits

The system shall allow the quantity of each cart item to be set to a
whole number from 1 to 10.

### REQ-CO-03: Remove items

The system shall allow a user to remove an item from their cart.

### REQ-CO-04: Persistent cart for logged-in users

The system shall keep a logged-in user's cart contents across sessions,
so items remain in the cart after the user logs out and back in.

## 2. Checkout Flow

### REQ-CO-05: Guest checkout

The system shall allow a user to complete checkout as a guest, without
creating an account.

### REQ-CO-06: Address validation and address book

The system shall validate the shipping address against the postal
service's address database, and shall save the validated address to the
user's address book.

### REQ-CO-07: Short checkout

The checkout should not take too many steps.

### REQ-CO-08: Order summary

Before payment, the system shall show an order summary listing each item,
the subtotal, the delivery fee, and the order total.

## 3. Payment

### REQ-CO-09: Card payment via PCI-compliant processor

The system shall process credit and debit card payments through a
PCI-compliant third-party payment processor.

### REQ-CO-10: Declined payments

If a payment is declined, the system shall show the decline reason
returned by the payment processor.

### REQ-CO-11: Fast payment processing

Payment processing should be fast.

## 4. Delivery

### REQ-CO-12: Free delivery threshold

The system shall charge no delivery fee for orders with a subtotal of
€50.00 or more, and a flat delivery fee of €4.95 for orders below €50.00.

### REQ-CO-13: Estimated delivery date

The system shall display an estimated delivery date based on the shipping
method the user selects.

## 5. Order Confirmation

### REQ-CO-14: Order confirmation email

The system shall send an order confirmation email with an itemized
receipt within 5 minutes of a successful payment.

### REQ-CO-15: Smooth checkout experience

The checkout experience should be smooth and intuitive.
