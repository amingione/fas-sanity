import React, {useState} from 'react'
import {Button, Flex, Menu, MenuButton, MenuItem} from '@sanity/ui'
import {BillIcon, CogIcon, EllipsisVerticalIcon, PackageIcon} from '@sanity/icons'
import {useRouter} from 'sanity/router'
import {ShippingQuoteDialog} from './ShippingQuoteDialog'

export function ShipmentsHeader() {
  const router = useRouter()
  const [showQuoteDialog, setShowQuoteDialog] = useState(false)

  const navigateToPath = (path: string) => {
    if (router.navigateUrl) {
      router.navigateUrl({path})
    }
  }

  const handleShippingSettings = () => {
    navigateToPath('/desk/admin;doc-links-archive;shipping-settings;sender-addresses')
  }

  const handleSchedulePickup = () => {
    navigateToPath('/desk/admin;doc-links-archive;pickups')
  }

  return (
    <>
      <Flex gap={2} align="center" justify="flex-end">
        <Button
          icon={CogIcon}
          mode="ghost"
          tone="default"
          title="Open shipping settings"
          onClick={handleShippingSettings}
        />

        <MenuButton
          id="shipments-header-actions"
          button={<Button icon={EllipsisVerticalIcon} text="Actions" mode="ghost" />}
          popover={{portal: true}}
          menu={
            <Menu>
              <MenuItem text="Schedule pickup" icon={PackageIcon} onClick={handleSchedulePickup} />
              <MenuItem
                text="Get shipping quote"
                icon={BillIcon}
                onClick={() => setShowQuoteDialog(true)}
              />
            </Menu>
          }
        />
      </Flex>
      {showQuoteDialog ? <ShippingQuoteDialog onClose={() => setShowQuoteDialog(false)} /> : null}
    </>
  )
}
