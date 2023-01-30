import { Trans, t } from '@lingui/macro'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMedia } from 'react-use'
import { Text } from 'rebass'
import styled from 'styled-components'

import { ButtonOutlined, ButtonPrimary } from 'components/Button'
import Icon from 'components/Icons/Icon'
import ReadMore from 'components/ReadMore'
import { RowBetween, RowFit } from 'components/Row'
import Search from 'components/Search'
import { MouseoverTooltip } from 'components/Tooltip'
import useTheme from 'hooks/useTheme'

import SingleToken from './pages/SingleToken'
import TokenAnalysisList from './pages/TokenAnalysisList'

const Wrapper = styled.div`
  padding: 32px 24px 50px;
  display: flex;
  align-items: stretch;
  justify-content: center;
  flex-direction: column;
  max-width: 1500px;
  width: 100%;
  color: ${({ theme }) => theme.subText};
  gap: 24px;

  @media only screen and (max-width: 768px) {
    gap: 20px;
    padding: 28px 16px 40px;
  }
`

export default function TrueSightV2() {
  const theme = useTheme()
  const [subscribed, setSubscribed] = useState(false)
  const location = useLocation()
  const isSingleToken = location?.pathname.includes('single-token')
  const above768 = useMedia('(min-width:768px)')
  const above600 = useMedia('(min-width:600px)')

  const RenderSearch = () => (
    <Search onSearch={(search: string) => console.log(search)} searchValue="" placeholder="Search" minWidth="340px" />
  )
  return (
    <Wrapper>
      <RowBetween>
        <RowFit color={theme.text} gap="6px">
          {above768 && <Icon id="truesight-v2" size={20} />}
          <Text fontSize={above768 ? 24 : 20}>
            <Trans>Discover Tokens</Trans>
          </Text>
        </RowFit>
        <RowFit gap="16px">
          {above768 && <RenderSearch />}
          {subscribed ? (
            <MouseoverTooltip
              text={t`Subscribe to receive daily email notifications witha curated list of tokens from each category!`}
              placement="right"
              delay={1200}
            >
              <ButtonPrimary onClick={() => setSubscribed(prev => !prev)} width="120px" height="36px" gap="4px">
                <Icon id="notification-2" size={16} />
                <Trans>Subscribe</Trans>
              </ButtonPrimary>
            </MouseoverTooltip>
          ) : (
            <ButtonOutlined onClick={() => setSubscribed(prev => !prev)} width="120px" height="36px">
              <Trans>Unsubscribe</Trans>
            </ButtonOutlined>
          )}
        </RowFit>
      </RowBetween>
      <ReadMore open={above600 ? true : false}>
        <Text fontSize={12} color={theme.subText} lineHeight="16px">
          <Trans>
            Our algorithm analyzes thousands of tokens and multiple on-chain / off-chain indicators each day to give you
            a curated list of tokens across various categories. You can further explore each token in detail - use our
            on-chain, technical and social analysis to find alpha and make better trading decisions!
          </Trans>
        </Text>
      </ReadMore>
      {!above768 && <RenderSearch />}
      {isSingleToken ? <SingleToken /> : <TokenAnalysisList />}
    </Wrapper>
  )
}