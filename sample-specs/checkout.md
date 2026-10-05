# Online Shop Checkout — Requirements Specification

This document describes the functional requirements for the checkout flow
of an online shop, covering the shopping cart, checkout steps, payment,
shipping, and order confirmation.

## 1. Shopping Cart

### REQ-1.1: Add, remove, and update cart items

The system shall allow a user to add items to their cart, remove items,
and update the quantity of an item already in the cart.

### REQ-1.2: Persistent cart for logged-in users

The system shall persist a logged-in user's cart contents across sessions,
so items remain in the cart after the user logs out and back in.

## 2. Checkout Flow

### REQ-2.1: Guest checkout

The system shall allow a user to complete checkout as a guest, without
requiring account creation.

### REQ-2.2: Shipping address validation

The system shall require a shipping address with street, city, postal
code, and country fields, and shall reject the address if any required
field is missing.

## 3. Payment

### REQ-3.1: Card payment via PCI-compliant processor

The system shall support payment by credit or debit card through a
PCI-compliant third-party payment processor, and shall never store raw
card numbers.

### REQ-3.2: Fast payment processing

Payment processing should be fast.

## 4. Shipping

### REQ-4.1: Estimated delivery date

The system shall display an estimated delivery date based on the shipping
method selected by the user at checkout.

### REQ-4.2: Reasonable shipping costs

Shipping costs should be reasonable.

## 5. Order Confirmation

### REQ-5.1: Order confirmation email

The system shall send an order confirmation email containing an itemized
receipt immediately after a successful payment.

### REQ-5.2: Smooth and intuitive checkout experience

The checkout experience should be smooth and intuitive.
