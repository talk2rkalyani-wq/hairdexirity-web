import React from 'react'
import type { InvoiceLineItem } from '../../../types/finance.ts'
import type { Staff } from '../../../types/models.ts'
import {
  ScissorsIcon,
  PackageIcon,
  TrashIcon,
  StaffIcon,
} from '../../../components/Icons.tsx'
import './PosCartTable.css'

interface PosCartTableProps {
  lineItems: InvoiceLineItem[]
  activeStaff: Staff[]
  onUpdateQuantity: (index: number, newQty: number) => void
  onUpdateStylist: (index: number, staffId: string, staffName: string) => void
  onUpdateDiscount: (index: number, discountAmount: number) => void
  onRemoveItem: (index: number) => void
  onClearCart: () => void
}

export const PosCartTable: React.FC<PosCartTableProps> = ({
  lineItems,
  activeStaff,
  onUpdateQuantity,
  onUpdateStylist,
  onUpdateDiscount,
  onRemoveItem,
  onClearCart,
}) => {
  if (lineItems.length === 0) {
    return (
      <div className="pos-cart-empty-container">
        <div className="empty-cart-illustration">
          <div className="illustration-icon-box">
            <ScissorsIcon size={28} />
          </div>
          <h3>Bill is currently empty</h3>
          <p>
            Select salon services or retail products from the catalog on the left to add items to this bill.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-cart-container">
      <div className="pos-cart-header">
        <div className="cart-header-title">
          <h4>Billed Items ({lineItems.length})</h4>
        </div>
        <button
          type="button"
          className="btn-clear-cart"
          onClick={onClearCart}
          title="Clear all items from bill"
        >
          Clear All
        </button>
      </div>

      <div className="pos-cart-table-wrapper">
        <table className="pos-cart-table">
          <thead>
            <tr>
              <th className="th-item">Item & Details</th>
              <th className="th-stylist">Stylist / Staff</th>
              <th className="th-qty">Qty</th>
              <th className="th-price">Price</th>
              <th className="th-discount">Discount (₹)</th>
              <th className="th-total">Total (₹)</th>
              <th className="th-action"></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => {
              const isService = item.itemType === 'service'
              return (
                <tr key={`${item.serviceId || item.productId || item.name || item.description}-${index}`} className="cart-row">
                  {/* Item Description & Type */}
                  <td className="td-item">
                    <div className="cart-item-info">
                      <span className={`item-type-pill ${isService ? 'service' : 'product'}`}>
                        {isService ? <ScissorsIcon size={12} /> : <PackageIcon size={12} />}
                        <span>{isService ? 'Service' : 'Retail'}</span>
                      </span>
                      <span className="cart-item-name">{item.name || item.description}</span>
                    </div>
                  </td>

                  {/* Stylist Dropdown */}
                  <td className="td-stylist">
                    {isService ? (
                      <div className="stylist-select-wrap">
                        <StaffIcon size={14} className="stylist-icon" />
                        <select
                          className="pos-table-select"
                          value={item.staffId || ''}
                          onChange={(e) => {
                            const staffId = e.target.value
                            const staff = activeStaff.find((s) => s.id === staffId)
                            onUpdateStylist(index, staffId, staff ? staff.name : '')
                          }}
                        >
                          <option value="">-- Assign Stylist --</option>
                          {activeStaff.map((staff) => (
                            <option key={staff.id} value={staff.id}>
                              {staff.name} {staff.jobTitle ? `(${staff.jobTitle})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className="stylist-not-applicable">Counter Sale</span>
                    )}
                  </td>

                  {/* Quantity Stepper */}
                  <td className="td-qty">
                    <div className="qty-stepper">
                      <button
                        type="button"
                        className="btn-qty-step minus"
                        onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                        title="Decrease quantity"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        className="qty-input"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (!isNaN(val) && val > 0) {
                            onUpdateQuantity(index, val)
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn-qty-step plus"
                        onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                        title="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </td>

                  {/* Unit Price */}
                  <td className="td-price">
                    <span className="cart-unit-price">₹{item.unitPrice.toFixed(2)}</span>
                  </td>

                  {/* Line Item Discount */}
                  <td className="td-discount">
                    <div className="line-discount-input-wrap">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="line-discount-input"
                        placeholder="0"
                        value={item.discountAmount && item.discountAmount > 0 ? item.discountAmount : ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          onUpdateDiscount(index, Math.max(0, val))
                        }}
                      />
                    </div>
                  </td>

                  {/* Line Total */}
                  <td className="td-total">
                    <span className="cart-line-total">
                      ₹{(item.lineTotal ?? item.totalPrice ?? (item.unitPrice * item.quantity)).toFixed(2)}
                    </span>
                  </td>

                  {/* Remove Button */}
                  <td className="td-action">
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => onRemoveItem(index)}
                      title="Remove item"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
